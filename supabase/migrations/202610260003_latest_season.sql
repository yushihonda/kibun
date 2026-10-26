begin;

-- TMDB keeps later seasons inside one show, so the newest season is stored
-- alongside it to flag shows whose new season has just started.
alter table public.movies
  add column if not exists latest_season_number smallint
    check (latest_season_number is null or latest_season_number >= 0),
  add column if not exists latest_season_air_date date;

commit;
