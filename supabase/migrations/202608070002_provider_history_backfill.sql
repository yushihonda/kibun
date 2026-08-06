begin;

update public.movies as movie
set providers_checked_at = snapshot.checked_at
from (
  select movie_id, max(updated_at) as checked_at
  from public.movie_providers
  where country = 'JP'
  group by movie_id
) as snapshot
where movie.id = snapshot.movie_id
  and movie.providers_checked_at is null;

insert into public.provider_availability_history (
  movie_id,
  tmdb_provider_id,
  offer_type,
  is_available,
  checked_at
)
select
  movie_provider.movie_id,
  provider.tmdb_provider_id,
  movie_provider.offer_type,
  true,
  movie_provider.updated_at
from public.movie_providers as movie_provider
join public.providers as provider on provider.id = movie_provider.provider_id
where movie_provider.country = 'JP'
on conflict (movie_id, tmdb_provider_id, offer_type, checked_at) do nothing;

commit;
