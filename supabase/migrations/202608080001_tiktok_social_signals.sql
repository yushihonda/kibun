begin;

create table public.movie_social_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  platform public.video_platform not null default 'tiktok'
    check (platform = 'tiktok'),
  video_id text not null check (char_length(video_id) between 1 and 128),
  url text not null check (url ~ '^https://([a-z0-9-]+\\.)*tiktok\\.com/'),
  caption text not null default '' check (char_length(caption) <= 4000),
  author_username text check (author_username is null or char_length(author_username) <= 100),
  region_code text check (region_code is null or region_code ~ '^[A-Z]{2}$'),
  posted_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 7200),
  view_count bigint not null default 0 check (view_count >= 0),
  like_count bigint not null default 0 check (like_count >= 0),
  comment_count bigint not null default 0 check (comment_count >= 0),
  share_count bigint not null default 0 check (share_count >= 0),
  engagement_rate numeric(9,4) not null default 0 check (engagement_rate between 0 and 1000),
  hashtags text[] not null default '{}',
  topics text[] not null default '{}',
  relevance_score numeric(5,4) not null default 0 check (relevance_score between 0 and 1),
  source text not null check (source in ('rapidapi', 'research_api', 'manual')),
  status public.video_status not null default 'approved',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (movie_id, video_id)
);

comment on table public.movie_social_posts is
  'Public TikTok post metadata associated with a title. Media files and individual comment bodies are not stored.';

create table public.movie_social_signals (
  movie_id uuid primary key references public.movies(id) on delete cascade,
  source text not null check (source in ('rapidapi', 'research_api', 'manual')),
  post_count integer not null default 0 check (post_count >= 0),
  total_views bigint not null default 0 check (total_views >= 0),
  total_likes bigint not null default 0 check (total_likes >= 0),
  total_comments bigint not null default 0 check (total_comments >= 0),
  total_shares bigint not null default 0 check (total_shares >= 0),
  average_engagement_rate numeric(9,4) not null default 0
    check (average_engagement_rate between 0 and 1000),
  trend_score numeric(5,2) not null default 0 check (trend_score between 0 and 100),
  sentiment text not null default 'neutral'
    check (sentiment in ('positive', 'mixed', 'negative', 'neutral')),
  sentiment_score numeric(4,3) not null default 0 check (sentiment_score between -1 and 1),
  top_hashtags text[] not null default '{}',
  topics text[] not null default '{}',
  summary text check (summary is null or char_length(summary) <= 1000),
  latest_post_at timestamptz,
  featured_posts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(featured_posts) = 'array'),
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.movie_social_signals is
  'Derived TikTok trend, engagement, hashtag, topic and sentiment signals used for discovery ranking.';

create trigger movie_social_posts_updated_at
before update on public.movie_social_posts
for each row execute function public.set_updated_at();

create trigger movie_social_signals_updated_at
before update on public.movie_social_signals
for each row execute function public.set_updated_at();

create index movie_social_posts_movie_trend_idx
  on public.movie_social_posts (movie_id, status, posted_at desc, view_count desc);
create index movie_social_posts_hashtags_idx
  on public.movie_social_posts using gin (hashtags);
create index movie_social_signals_trend_idx
  on public.movie_social_signals (trend_score desc, latest_post_at desc);

alter table public.movie_social_posts enable row level security;
alter table public.movie_social_signals enable row level security;

create policy movie_social_posts_public_approved_read
on public.movie_social_posts
for select to anon, authenticated
using (status = 'approved');

create policy movie_social_signals_public_read
on public.movie_social_signals
for select to anon, authenticated
using (true);

grant select on public.movie_social_posts, public.movie_social_signals
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
