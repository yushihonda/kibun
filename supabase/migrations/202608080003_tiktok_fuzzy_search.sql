begin;

create or replace function public.normalize_social_search_term(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select lower(
    regexp_replace(
      normalize(coalesce(p_value, ''), NFKC),
      '[#＃[:space:]_.・･/-]+',
      '',
      'g'
    )
  );
$$;

revoke all on function public.normalize_social_search_term(text)
  from public, anon, authenticated;

create or replace function public.search_movies(
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
      public.normalize_social_search_term(
        left(btrim(coalesce(p_query, '')), 500)
      ) as normalized_query,
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
  ),
  social_matches as (
    select
      ms.movie_id,
      (
        max(
          (
            case
              when normalized.normalized_term = s.normalized_query then
                case when social_term.kind = 'hashtag' then 1.45 else 1.20 end
              when
                char_length(normalized.normalized_term) >= 3
                and char_length(s.normalized_query) >= 3
                and (
                  s.normalized_query like '%' || normalized.normalized_term || '%'
                  or normalized.normalized_term like '%' || s.normalized_query || '%'
                )
                then case when social_term.kind = 'hashtag' then 1.05 else 0.90 end
              else
                (
                  0.55
                  + similarity(
                      normalized.normalized_term,
                      s.normalized_query
                    ) * 0.50
                )
                * case when social_term.kind = 'hashtag' then 1.0 else 0.9 end
            end
          )
          * greatest(
              0.72,
              1.0 - (least(social_term.term_order, 8) - 1) * 0.04
            )
        )
        + least(greatest(max(ms.trend_score), 0), 100) * 0.0012
      )::double precision as match_score
    from public.movie_social_signals ms
    cross join safe s
    cross join lateral (
      select hashtag as term, 'hashtag'::text as kind, term_order
      from unnest(ms.top_hashtags) with ordinality hashtags(hashtag, term_order)
      union all
      select topic as term, 'topic'::text as kind, term_order
      from unnest(ms.topics) with ordinality topics(topic, term_order)
    ) social_term
    cross join lateral (
      select public.normalize_social_search_term(social_term.term) as normalized_term
    ) normalized
    where
      s.normalized_query <> ''
      and char_length(s.normalized_query) >= 2
      and s.normalized_query <> all(array[
        'fyp', 'foryou', 'foryoupage', 'tiktok', 'ティックトック',
        'viral', 'trend', 'trending', 'バズ', 'バズる',
        'おすすめ', 'オススメ', 'recommend', '映画', '映画紹介',
        '映画好き', 'ドラマ', 'ドラマ紹介', 'ドラマ好き', '邦画',
        '洋画', '日本', 'japan', 'jp'
      ]::text[])
      and char_length(normalized.normalized_term) >= 2
      and normalized.normalized_term <> all(array[
        'fyp', 'foryou', 'foryoupage', 'tiktok', 'ティックトック',
        'viral', 'trend', 'trending', 'バズ', 'バズる',
        'おすすめ', 'オススメ', 'recommend', '映画', '映画紹介',
        '映画好き', 'ドラマ', 'ドラマ紹介', 'ドラマ好き', '邦画',
        '洋画', '日本', 'japan', 'jp'
      ]::text[])
      and ms.post_count > 0
      and coalesce(ms.latest_post_at, ms.calculated_at)
        >= now() - interval '120 days'
      and (
        normalized.normalized_term = s.normalized_query
        or (
          char_length(normalized.normalized_term) >= 3
          and char_length(s.normalized_query) >= 3
          and (
            s.normalized_query like '%' || normalized.normalized_term || '%'
            or normalized.normalized_term like '%' || s.normalized_query || '%'
          )
        )
        or (
          char_length(normalized.normalized_term) >= 4
          and char_length(s.normalized_query) >= 4
          and similarity(normalized.normalized_term, s.normalized_query) >= 0.40
        )
      )
    group by ms.movie_id
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
      + coalesce(sm.match_score, 0)
    )::double precision as rank
  from public.movies m
  cross join safe s
  left join social_matches sm on sm.movie_id = m.id
  where
    (
      s.query = ''
      or m.search_text &@ s.query
      or similarity(m.title, s.query) >= 0.12
      or similarity(coalesce(m.original_title, ''), s.query) >= 0.12
      or sm.movie_id is not null
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

notify pgrst, 'reload schema';

commit;
