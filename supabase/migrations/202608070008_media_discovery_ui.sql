alter table public.movies
  add column if not exists theatrical_at timestamptz;

comment on column public.movies.theatrical_at is
  'Last time this film appeared in the TMDB Japan now-playing feed.';

create index if not exists movies_theatrical_at_idx
  on public.movies (theatrical_at desc)
  where theatrical_at is not null;
