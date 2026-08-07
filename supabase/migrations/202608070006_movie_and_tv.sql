begin;

alter table public.movies
  add column if not exists media_type text not null default 'movie'
    check (media_type in ('movie', 'tv')),
  add column if not exists number_of_seasons integer
    check (number_of_seasons is null or number_of_seasons >= 0),
  add column if not exists number_of_episodes integer
    check (number_of_episodes is null or number_of_episodes >= 0);

alter table public.movies drop constraint if exists movies_tmdb_id_key;
drop index if exists public.movies_tmdb_id_key;
create unique index if not exists movies_media_type_tmdb_id_key
  on public.movies (media_type, tmdb_id);
create index if not exists movies_media_type_popularity_idx
  on public.movies (media_type, popularity desc);

comment on column public.movies.media_type is
  'TMDB catalog type: movie for films, tv for television drama/series.';
comment on column public.movies.runtime is
  'Film runtime or representative TV episode runtime, in minutes.';

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
    case new.media_type when 'tv' then 'ドラマ TV シリーズ' else '映画' end,
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
  title, original_title, overview, tagline, media_type, genres,
  emotional_tags, keywords, aliases, origin_countries, original_language
on public.movies for each row execute function public.set_movie_search_text();

update public.movies set media_type = media_type;

drop function if exists public.replace_movie_providers(
  bigint,
  jsonb,
  timestamptz
);

create function public.replace_movie_providers(
  p_tmdb_movie_id bigint,
  p_providers jsonb,
  p_synced_at timestamptz,
  p_media_type text default 'movie'
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
  if p_media_type not in ('movie', 'tv') then
    raise exception 'Unsupported media type: %', p_media_type;
  end if;

  select id into strict v_movie_id
  from public.movies
  where tmdb_id = p_tmdb_movie_id
    and media_type = p_media_type;

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

revoke all on function public.replace_movie_providers(
  bigint,
  jsonb,
  timestamptz,
  text
) from public, anon, authenticated;
grant execute on function public.replace_movie_providers(
  bigint,
  jsonb,
  timestamptz,
  text
) to service_role;

drop function if exists public.search_movies(
  text,
  text[],
  text[],
  public.offer_type[],
  integer,
  numeric,
  integer,
  text[],
  boolean,
  integer,
  integer
);
drop function if exists public.search_movies(
  text,
  text[],
  text[],
  public.offer_type[],
  integer,
  numeric,
  text[],
  boolean,
  integer,
  integer
);

create function public.search_movies(
  p_query text default '',
  p_origin_countries text[] default null,
  p_provider_slugs text[] default null,
  p_offer_types public.offer_type[] default null,
  p_max_runtime integer default null,
  p_min_rating numeric default null,
  p_tags text[] default null,
  p_exclude_watched boolean default false,
  p_media_types text[] default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  tmdb_id bigint,
  media_type text,
  title text,
  original_title text,
  overview text,
  poster_path text,
  backdrop_path text,
  release_date date,
  runtime integer,
  vote_average numeric,
  popularity numeric,
  genres text[],
  emotional_tags text[],
  providers jsonb,
  video jsonb,
  rank double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with safe as (
    select
      left(btrim(coalesce(p_query, '')), 500) as query,
      case when p_max_runtime between 1 and 1440 then p_max_runtime end as max_runtime,
      case when p_min_rating between 0 and 10 then p_min_rating end as min_rating,
      coalesce(p_origin_countries, '{}'::text[]) as origin_countries,
      coalesce(p_provider_slugs, '{}'::text[]) as provider_slugs,
      coalesce(p_offer_types, '{}'::public.offer_type[]) as offer_types,
      coalesce(p_tags, '{}'::text[]) as tags,
      array(
        select value from unnest(coalesce(p_media_types, '{}'::text[])) value
        where value in ('movie', 'tv')
      ) as media_types,
      least(greatest(coalesce(p_limit, 30), 1), 100) as row_limit,
      least(greatest(coalesce(p_offset, 0), 0), 10000) as row_offset
  )
  select
    m.id,
    m.tmdb_id,
    m.media_type,
    m.title,
    m.original_title,
    m.overview,
    m.poster_path,
    m.backdrop_path,
    m.release_date,
    m.runtime,
    m.vote_average,
    m.popularity,
    m.genres,
    m.emotional_tags,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pr.tmdb_provider_id,
          'name', pr.name,
          'slug', pr.slug,
          'type', mp.offer_type,
          'tmdbLink', mp.tmdb_link
        )
        order by pr.name, mp.offer_type
      )
      from public.movie_providers mp
      join public.providers pr on pr.id = mp.provider_id
      where mp.movie_id = m.id and mp.country = 'JP'
    ), '[]'::jsonb) as providers,
    (
      select jsonb_build_object(
        'platform', mv.platform,
        'videoId', mv.video_id,
        'url', mv.url
      )
      from public.movie_videos mv
      where mv.movie_id = m.id and mv.status = 'approved'
      order by mv.platform = 'youtube' desc, mv.created_at desc
      limit 1
    ) as video,
    (
      case when s.query = '' then 0
        when m.search_text &@ s.query then 2 else 0 end
      + greatest(
          similarity(m.title, s.query),
          similarity(coalesce(m.original_title, ''), s.query)
        )
    )::double precision as rank
  from public.movies m
  cross join safe s
  where
    (
      s.query = ''
      or m.search_text &@ s.query
      or similarity(m.title, s.query) >= 0.12
      or similarity(coalesce(m.original_title, ''), s.query) >= 0.12
    )
    and (
      cardinality(s.media_types) = 0
      or m.media_type = any(s.media_types)
    )
    and (
      cardinality(s.origin_countries) = 0
      or m.origin_countries && s.origin_countries
    )
    and (s.max_runtime is null or m.runtime <= s.max_runtime)
    and (s.min_rating is null or m.vote_average >= s.min_rating)
    and (
      cardinality(s.tags) = 0
      or m.emotional_tags && s.tags
      or m.genres && s.tags
    )
    and (
      cardinality(s.provider_slugs) = 0
      or exists (
        select 1
        from public.movie_providers mp
        join public.providers pr on pr.id = mp.provider_id
        where mp.movie_id = m.id
          and mp.country = 'JP'
          and pr.slug = any(s.provider_slugs)
      )
    )
    and (
      cardinality(s.offer_types) = 0
      or exists (
        select 1
        from public.movie_providers mp
        where mp.movie_id = m.id
          and mp.country = 'JP'
          and mp.offer_type = any(s.offer_types)
      )
    )
    and (
      not coalesce(p_exclude_watched, false)
      or auth.uid() is null
      or not exists (
        select 1
        from public.user_movie_interactions umi
        where umi.movie_id = m.id
          and umi.user_id = auth.uid()
          and umi.status = 'WATCHED'
      )
    )
  order by rank desc, m.popularity desc, m.vote_average desc, m.id
  limit (select row_limit from safe)
  offset (select row_offset from safe);
$$;

create function public.search_movies(
  p_query text default '',
  p_origin_countries text[] default null,
  p_provider_slugs text[] default null,
  p_offer_types public.offer_type[] default null,
  p_max_runtime integer default null,
  p_min_rating numeric default null,
  p_min_vote_count integer default null,
  p_tags text[] default null,
  p_exclude_watched boolean default false,
  p_media_types text[] default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  tmdb_id bigint,
  media_type text,
  title text,
  original_title text,
  overview text,
  poster_path text,
  backdrop_path text,
  release_date date,
  runtime integer,
  vote_average numeric,
  popularity numeric,
  genres text[],
  emotional_tags text[],
  providers jsonb,
  video jsonb,
  rank double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select result.*
  from public.search_movies(
    p_query,
    p_origin_countries,
    p_provider_slugs,
    p_offer_types,
    p_max_runtime,
    p_min_rating,
    p_tags,
    p_exclude_watched,
    p_media_types,
    100,
    0
  ) result
  join public.movies m on m.id = result.id
  where
    p_min_vote_count is null
    or m.vote_count >= least(greatest(p_min_vote_count, 0), 1000000)
  order by result.rank desc, result.popularity desc, result.vote_average desc, result.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;

revoke all on function public.search_movies(
  text,
  text[],
  text[],
  public.offer_type[],
  integer,
  numeric,
  text[],
  boolean,
  text[],
  integer,
  integer
) from public;
grant execute on function public.search_movies(
  text,
  text[],
  text[],
  public.offer_type[],
  integer,
  numeric,
  text[],
  boolean,
  text[],
  integer,
  integer
) to anon, authenticated;

revoke all on function public.search_movies(
  text,
  text[],
  text[],
  public.offer_type[],
  integer,
  numeric,
  integer,
  text[],
  boolean,
  text[],
  integer,
  integer
) from public;
grant execute on function public.search_movies(
  text,
  text[],
  text[],
  public.offer_type[],
  integer,
  numeric,
  integer,
  text[],
  boolean,
  text[],
  integer,
  integer
) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
