begin;

-- The initial TMDB import queried watch providers for every movie. Movies with
-- no JP offers have no movie_providers row, so preserve that negative check by
-- falling back to the movie sync timestamp.
update public.movies
set providers_checked_at = coalesce(last_synced_at, updated_at, created_at, now())
where providers_checked_at is null;

commit;
