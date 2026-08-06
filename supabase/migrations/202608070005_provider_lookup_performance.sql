-- Provider rows are loaded by movie and country on TOP, search, and recommendations.
-- The original index starts with country/offer/provider, which leaves movie_id last
-- and makes these page-load lookups scan far more rows than needed.

create index if not exists movie_providers_movie_country_idx
  on public.movie_providers (movie_id, country);
