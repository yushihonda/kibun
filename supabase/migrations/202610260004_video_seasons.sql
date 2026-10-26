begin;

-- TMDB lists trailers per season for shows that run several seasons, so a
-- show can carry one trailer per season and viewers can switch between them.
-- Null means the trailer belongs to the show as a whole.
alter table public.movie_videos
  add column if not exists season_number smallint
    check (season_number is null or season_number >= 0);

create index if not exists movie_videos_movie_season_idx
  on public.movie_videos (movie_id, season_number);

commit;
