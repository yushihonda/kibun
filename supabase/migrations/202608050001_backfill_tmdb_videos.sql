begin;

insert into public.movie_videos (
  movie_id,
  platform,
  video_id,
  url,
  status
)
select
  m.id,
  'youtube'::public.video_platform,
  m.youtube_video_key,
  'https://www.youtube.com/watch?v=' || m.youtube_video_key,
  'approved'::public.video_status
from public.movies m
where nullif(btrim(m.youtube_video_key), '') is not null
on conflict (platform, video_id) do update
set
  movie_id = excluded.movie_id,
  url = excluded.url,
  status = 'approved'::public.video_status,
  updated_at = now();

commit;
