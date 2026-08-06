begin;

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
  integer,
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
  integer,
  text[],
  boolean,
  integer,
  integer
) to anon, authenticated;

commit;
