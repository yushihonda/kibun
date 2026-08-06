begin;

drop function public.search_movies(
  text,
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
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  tmdb_id bigint,
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
      least(greatest(coalesce(p_limit, 30), 1), 100) as row_limit,
      least(greatest(coalesce(p_offset, 0), 0), 10000) as row_offset
  )
  select
    m.id,
    m.tmdb_id,
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

revoke all on function public.search_movies(
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
  integer,
  integer
) to anon, authenticated;

commit;
