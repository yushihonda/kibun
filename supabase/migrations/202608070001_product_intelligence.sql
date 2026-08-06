begin;

alter table public.movies
  add column if not exists keywords text[] not null default '{}',
  add column if not exists aliases text[] not null default '{}',
  add column if not exists emotional_scores jsonb not null default '{}'::jsonb,
  add column if not exists emotion_source text not null default 'unclassified',
  add column if not exists emotion_updated_at timestamptz,
  add column if not exists tmdb_collection_id bigint,
  add column if not exists providers_checked_at timestamptz;

create table if not exists public.movie_emotion_overrides (
  movie_id uuid not null references public.movies(id) on delete cascade,
  tag text not null check (char_length(btrim(tag)) between 1 and 40),
  intensity numeric(3,2) not null check (intensity between 0 and 1),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (movie_id, tag)
);

create table if not exists public.movie_aliases (
  id bigint generated always as identity primary key,
  movie_id uuid not null references public.movies(id) on delete cascade,
  alias text not null check (char_length(btrim(alias)) between 1 and 500),
  kind text not null default 'alternate'
    check (kind in ('alternate', 'reading', 'localized', 'manual')),
  created_at timestamptz not null default now(),
  unique (movie_id, alias)
);

create table if not exists public.provider_availability_history (
  id bigint generated always as identity primary key,
  movie_id uuid not null references public.movies(id) on delete cascade,
  tmdb_provider_id integer not null,
  offer_type public.offer_type not null,
  is_available boolean not null,
  checked_at timestamptz not null,
  unique (movie_id, tmdb_provider_id, offer_type, checked_at)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  personalization_enabled boolean not null default true,
  preferred_genres text[] not null default '{}',
  preferred_emotions text[] not null default '{}',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  session_id uuid,
  event_name text not null check (
    event_name in (
      'search', 'zero_results', 'impression', 'movie_click', 'save',
      'playback_start', 'detail_view', 'share', 'recommendation_feedback'
    )
  ),
  movie_id uuid references public.movies(id) on delete cascade,
  section_id text check (section_id is null or char_length(section_id) <= 80),
  query text check (query is null or char_length(query) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (user_id is not null or session_id is not null)
);

create table if not exists public.search_feedback (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  session_id uuid,
  query text not null check (char_length(btrim(query)) between 1 and 500),
  movie_id uuid not null references public.movies(id) on delete cascade,
  is_relevant boolean not null,
  created_at timestamptz not null default now(),
  check (user_id is not null or session_id is not null)
);

create table if not exists public.support_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text check (email is null or char_length(email) <= 254),
  category text not null check (
    category in ('question', 'privacy', 'deletion', 'copyright', 'other')
  ),
  body text not null check (char_length(btrim(body)) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_rate_limits (
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (key_hash, window_start)
);

create index if not exists movies_keywords_idx
  on public.movies using gin (keywords);
create index if not exists movies_aliases_idx
  on public.movies using gin (aliases);
create index if not exists movies_collection_idx
  on public.movies (tmdb_collection_id) where tmdb_collection_id is not null;
create index if not exists movies_last_synced_idx
  on public.movies (last_synced_at desc);
create index if not exists movie_aliases_pgroonga_idx
  on public.movie_aliases using pgroonga (
    alias extensions.pgroonga_text_full_text_search_ops_v2
  );
create index if not exists product_events_created_idx
  on public.product_events (created_at desc);
create index if not exists product_events_section_idx
  on public.product_events (section_id, event_name, created_at desc);
create index if not exists product_events_user_idx
  on public.product_events (user_id, created_at desc) where user_id is not null;
create index if not exists search_feedback_query_idx
  on public.search_feedback (query, created_at desc);
create index if not exists rate_limits_cleanup_idx
  on public.api_rate_limits (window_start);
create index if not exists provider_history_lookup_idx
  on public.provider_availability_history
  (movie_id, checked_at desc, is_available);

create or replace function public.set_movie_search_text()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.search_text := btrim(concat_ws(
    ' ',
    new.title,
    new.original_title,
    new.overview,
    new.tagline,
    array_to_string(new.genres, ' '),
    array_to_string(new.emotional_tags, ' '),
    array_to_string(new.keywords, ' '),
    array_to_string(new.aliases, ' '),
    array_to_string(new.origin_countries, ' '),
    new.original_language
  ));
  return new;
end;
$$;

drop trigger if exists movies_search_text_before_write on public.movies;
create trigger movies_search_text_before_write
before insert or update of
  title, original_title, overview, tagline, genres, emotional_tags,
  keywords, aliases, origin_countries, original_language
on public.movies for each row execute function public.set_movie_search_text();

create trigger movie_emotion_overrides_updated_at
before update on public.movie_emotion_overrides
for each row execute function public.set_updated_at();
create trigger user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();
create trigger support_requests_updated_at
before update on public.support_requests
for each row execute function public.set_updated_at();

update public.movies set keywords = keywords;

create or replace function public.consume_api_quota(
  p_key_hash text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if char_length(p_key_hash) < 16
    or p_window_seconds not between 1 and 86400
    or p_max_requests not between 1 and 10000
  then
    return false;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limits (key_hash, window_start, request_count)
  values (p_key_hash, v_window, 1)
  on conflict (key_hash, window_start)
  do update set request_count = public.api_rate_limits.request_count + 1
  returning request_count into v_count;

  if random() < 0.01 then
    delete from public.api_rate_limits
    where window_start < now() - interval '2 days';
  end if;

  return v_count <= p_max_requests;
end;
$$;

create or replace function public.delete_own_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  delete from auth.users where id = v_user_id;
end;
$$;

create or replace function public.most_saved_movies(p_limit integer default 40)
returns table (movie_id uuid, save_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select interaction.movie_id, count(*)::bigint as save_count
  from public.user_movie_interactions interaction
  where interaction.is_favorite or interaction.status = 'WATCHLIST'
  group by interaction.movie_id
  order by save_count desc, interaction.movie_id
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;

alter table public.movie_emotion_overrides enable row level security;
alter table public.movie_aliases enable row level security;
alter table public.provider_availability_history enable row level security;
alter table public.user_preferences enable row level security;
alter table public.product_events enable row level security;
alter table public.search_feedback enable row level security;
alter table public.support_requests enable row level security;
alter table public.api_rate_limits enable row level security;

create policy movie_emotion_overrides_admin_all
on public.movie_emotion_overrides for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy movie_aliases_public_read
on public.movie_aliases for select using (true);
create policy movie_aliases_admin_write
on public.movie_aliases for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy provider_history_public_read
on public.provider_availability_history for select using (true);
create policy provider_history_admin_write
on public.provider_availability_history for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy user_preferences_own_rows
on public.user_preferences for all
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy user_preferences_admin_read
on public.user_preferences for select to authenticated using (public.is_admin());

create policy product_events_insert
on public.product_events for insert
with check (
  user_id = (select auth.uid())
  or (user_id is null and session_id is not null)
);
create policy product_events_own_read
on public.product_events for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
create policy product_events_own_delete
on public.product_events for delete
using (user_id = (select auth.uid()));

create policy search_feedback_insert
on public.search_feedback for insert
with check (
  user_id = (select auth.uid())
  or (user_id is null and session_id is not null)
);
create policy search_feedback_own_read
on public.search_feedback for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
create policy search_feedback_own_delete
on public.search_feedback for delete
using (user_id = (select auth.uid()));

create policy support_requests_insert
on public.support_requests for insert
with check (user_id is null or user_id = (select auth.uid()));
create policy support_requests_own_read
on public.support_requests for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
create policy support_requests_admin_update
on public.support_requests for update to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select on public.movie_aliases to anon, authenticated;
grant select on public.provider_availability_history to anon, authenticated;
grant insert, update, delete on public.movie_aliases,
  public.movie_emotion_overrides to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert, delete on public.product_events,
  public.search_feedback to authenticated;
grant insert on public.product_events, public.search_feedback,
  public.support_requests to anon;
grant select, insert on public.support_requests to authenticated;
grant usage, select on sequence public.movie_aliases_id_seq,
  public.provider_availability_history_id_seq, public.product_events_id_seq,
  public.search_feedback_id_seq
  to anon, authenticated;

revoke all on public.api_rate_limits from public, anon, authenticated;
revoke all on function public.consume_api_quota(text, integer, integer)
  from public;
grant execute on function public.consume_api_quota(text, integer, integer)
  to anon, authenticated;
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
revoke all on function public.most_saved_movies(integer) from public;
grant execute on function public.most_saved_movies(integer) to anon, authenticated;

grant all on public.movie_emotion_overrides, public.movie_aliases,
  public.provider_availability_history, public.user_preferences,
  public.product_events, public.search_feedback, public.support_requests,
  public.api_rate_limits to service_role;
grant all on sequence public.movie_aliases_id_seq,
  public.provider_availability_history_id_seq, public.product_events_id_seq,
  public.search_feedback_id_seq
  to service_role;

commit;
