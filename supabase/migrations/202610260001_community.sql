begin;

-- Public profile fields. The shelf stays private until the owner opts in.
alter table public.profiles
  add column if not exists bio text check (bio is null or char_length(bio) <= 300),
  add column if not exists shelf_public boolean not null default false;

grant update (display_name, bio, shelf_public) on public.profiles to authenticated;

-- Profiles are readable only by their owner, so other users see this subset.
create or replace view public.public_profiles as
  select id, display_name, avatar_url, bio, shelf_public, created_at
  from public.profiles;

grant select on public.public_profiles to anon, authenticated;

create or replace function public.is_shelf_public(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select shelf_public from public.profiles where id = p_user_id),
    false
  );
$$;

grant execute on function public.is_shelf_public(uuid) to anon, authenticated;

create policy interactions_public_shelf_read on public.user_movie_interactions
  for select to anon, authenticated
  using (public.is_shelf_public(user_id));

grant select on public.user_movie_interactions to anon;

create table public.community_boards (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

insert into public.community_boards (slug, name, description, sort_order) values
  ('now-airing', '今期ドラマ', '放送中・配信中のドラマを語る', 10),
  ('in-theaters', '上映中の映画', '劇場で観た作品の感想', 20),
  ('recommend', 'おすすめ教えて', '気分や条件を書いて作品を教えてもらう', 30),
  ('tearjerker', '泣ける作品', '泣いた作品・刺さった場面', 40),
  ('free', '雑談', '映画・ドラマにまつわる話なら何でも', 50)
on conflict (slug) do nothing;

-- Movie comments, board threads, and replies share one table.
-- A root row belongs to exactly one movie or board; replies inherit it.
create table public.comments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id uuid references public.movies(id) on delete cascade,
  board text references public.community_boards(slug) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  title text check (title is null or char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  is_spoiler boolean not null default false,
  like_count integer not null default 0,
  reply_count integer not null default 0,
  deleted_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(movie_id, board) = 1)
);

create index comments_movie_roots_idx on public.comments (movie_id, created_at desc)
  where parent_id is null;
create index comments_board_roots_idx on public.comments (board, created_at desc)
  where parent_id is null;
create index comments_parent_idx on public.comments (parent_id, created_at);
create index comments_user_idx on public.comments (user_id, created_at desc);

create trigger comments_updated_at before update on public.comments
  for each row execute function public.set_updated_at();

create or replace function public.prepare_comment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent public.comments%rowtype;
begin
  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if not found or parent.deleted_at is not null then
      raise exception 'Parent comment is not available';
    end if;
    if parent.parent_id is not null then
      raise exception 'Replies can only be one level deep';
    end if;
    new.movie_id := parent.movie_id;
    new.board := parent.board;
    new.title := null;
  elsif new.board is not null and new.title is null then
    raise exception 'Board threads require a title';
  end if;
  new.like_count := 0;
  new.reply_count := 0;
  new.deleted_at := null;
  new.hidden_at := null;
  return new;
end;
$$;

create trigger comments_prepare_before_insert
  before insert on public.comments
  for each row execute function public.prepare_comment();

create or replace function public.protect_comment_moderation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.hidden_at is distinct from old.hidden_at
    and coalesce(auth.role(), '') <> 'service_role'
    and not public.is_admin()
  then
    raise exception 'Only administrators may moderate comments';
  end if;
  return new;
end;
$$;

create trigger comments_protect_moderation_before_update
  before update of hidden_at on public.comments
  for each row execute function public.protect_comment_moderation();

create or replace function public.count_comment_replies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.parent_id is not null then
    update public.comments set reply_count = reply_count + 1
    where id = new.parent_id;
  elsif tg_op = 'DELETE' and old.parent_id is not null then
    update public.comments set reply_count = greatest(reply_count - 1, 0)
    where id = old.parent_id;
  end if;
  return null;
end;
$$;

create trigger comments_count_replies
  after insert or delete on public.comments
  for each row execute function public.count_comment_replies();

create table public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index comment_likes_user_idx on public.comment_likes (user_id);

create or replace function public.count_comment_likes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set like_count = like_count + 1
    where id = new.comment_id;
  else
    update public.comments set like_count = greatest(like_count - 1, 0)
    where id = old.comment_id;
  end if;
  return null;
end;
$$;

create trigger comment_likes_count
  after insert or delete on public.comment_likes
  for each row execute function public.count_comment_likes();

create table public.user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index user_follows_followee_idx on public.user_follows (followee_id);

create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.comment_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spoiler', 'harassment', 'spam', 'inappropriate', 'other')),
  detail text check (detail is null or char_length(detail) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (comment_id, reporter_id)
);

create index comment_reports_open_idx on public.comment_reports (created_at desc)
  where status = 'open';

alter table public.community_boards enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.user_follows enable row level security;
alter table public.user_blocks enable row level security;
alter table public.comment_reports enable row level security;

create policy community_boards_public_read on public.community_boards
  for select to anon, authenticated using (true);
create policy community_boards_admin_write on public.community_boards
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy comments_public_read on public.comments
  for select to anon, authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or public.is_admin());
create policy comments_own_insert on public.comments
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy comments_own_update on public.comments
  for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy comments_own_delete on public.comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy comment_likes_public_read on public.comment_likes
  for select to anon, authenticated using (true);
create policy comment_likes_own_insert on public.comment_likes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy comment_likes_own_delete on public.comment_likes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy user_follows_public_read on public.user_follows
  for select to anon, authenticated using (true);
create policy user_follows_own_insert on public.user_follows
  for insert to authenticated with check (follower_id = (select auth.uid()));
create policy user_follows_own_delete on public.user_follows
  for delete to authenticated using (follower_id = (select auth.uid()));

create policy user_blocks_own_rows on public.user_blocks
  for all to authenticated
  using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));

create policy comment_reports_own_insert on public.comment_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy comment_reports_own_read on public.comment_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());
create policy comment_reports_admin_update on public.comment_reports
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.community_boards, public.comments, public.comment_likes,
  public.user_follows to anon, authenticated;
grant insert, update, delete on public.community_boards to authenticated;
grant insert, delete on public.comments, public.comment_likes,
  public.user_follows to authenticated;
grant update (title, body, is_spoiler, deleted_at, hidden_at)
  on public.comments to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select, insert on public.comment_reports to authenticated;
grant update (status, resolved_at) on public.comment_reports to authenticated;

commit;
