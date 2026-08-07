alter table public.movies
  add column if not exists trending_at timestamptz;

comment on column public.movies.trending_at is
  'Last time this title appeared in the TMDB weekly trending feed.';

create index if not exists movies_trending_at_idx
  on public.movies (trending_at desc)
  where trending_at is not null;
