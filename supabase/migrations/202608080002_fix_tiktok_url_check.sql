begin;

alter table public.movie_social_posts
  drop constraint if exists movie_social_posts_url_check;

alter table public.movie_social_posts
  add constraint movie_social_posts_url_check
  check (
    url ~ $tiktok_url$^https://([a-z0-9-]+\.)*tiktok\.com/$tiktok_url$
  );

notify pgrst, 'reload schema';

commit;
