begin;

alter table public.movies
  add column if not exists tmdb_genres jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default '',
  add column if not exists tagline text not null default '',
  add column if not exists homepage text not null default '',
  add column if not exists imdb_id text,
  add column if not exists vote_count integer not null default 0,
  add column if not exists adult boolean not null default false,
  add column if not exists tmdb_cast jsonb not null default '[]'::jsonb,
  add column if not exists tmdb_directors jsonb not null default '[]'::jsonb,
  add column if not exists youtube_video_key text,
  add column if not exists ai_emotion_tags text[] not null default '{}',
  add column if not exists sources text[] not null default '{}',
  add column if not exists synced_hash text,
  add column if not exists last_synced_at timestamptz;

alter table public.sync_runs
  add column if not exists discovered_count integer not null default 0,
  add column if not exists succeeded_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists errors jsonb not null default '[]'::jsonb;

create or replace function public.replace_movie_providers(
  p_tmdb_movie_id bigint,
  p_providers jsonb,
  p_synced_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movie_id uuid;
  v_provider record;
  v_provider_id bigint;
  v_slug text;
begin
  select id into strict v_movie_id
  from public.movies
  where tmdb_id = p_tmdb_movie_id;

  delete from public.movie_providers
  where movie_id = v_movie_id
    and country = 'JP'
    and offer_type in ('flatrate', 'rent', 'buy');

  for v_provider in
    select *
    from jsonb_to_recordset(coalesce(p_providers, '[]'::jsonb)) as item(
      tmdb_movie_id bigint,
      provider_id integer,
      provider_name text,
      provider_type text,
      logo_path text,
      tmdb_link text,
      is_available boolean,
      last_seen_at timestamptz
    )
  loop
    v_slug := coalesce(
      nullif(
        trim(both '-' from regexp_replace(
          lower(v_provider.provider_name),
          '[^a-z0-9]+',
          '-',
          'g'
        )),
        ''
      ),
      'tmdb-' || v_provider.provider_id::text
    );

    insert into public.providers (tmdb_provider_id, name, slug, logo_path)
    values (
      v_provider.provider_id,
      v_provider.provider_name,
      v_slug,
      v_provider.logo_path
    )
    on conflict (tmdb_provider_id) do update set
      name = excluded.name,
      logo_path = excluded.logo_path
    returning id into v_provider_id;

    insert into public.movie_providers (
      movie_id,
      provider_id,
      country,
      offer_type,
      tmdb_link,
      updated_at
    )
    values (
      v_movie_id,
      v_provider_id,
      'JP',
      v_provider.provider_type::public.offer_type,
      v_provider.tmdb_link,
      p_synced_at
    )
    on conflict (movie_id, provider_id, country, offer_type)
    do update set
      tmdb_link = excluded.tmdb_link,
      updated_at = excluded.updated_at;
  end loop;
end;
$$;

revoke all on function public.replace_movie_providers(bigint, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_movie_providers(bigint, jsonb, timestamptz)
  to service_role;

commit;
