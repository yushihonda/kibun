begin;

alter policy profiles_select_self_or_admin on public.profiles
  to authenticated;
alter policy profiles_update_self_or_admin on public.profiles
  to authenticated;
alter policy profiles_admin_all on public.profiles
  to authenticated;
alter policy movies_admin_write on public.movies
  to authenticated;
alter policy providers_admin_write on public.providers
  to authenticated;
alter policy movie_providers_admin_write on public.movie_providers
  to authenticated;
alter policy movie_videos_public_approved_read on public.movie_videos
  to anon, authenticated using (status = 'approved');
alter policy movie_videos_admin_write on public.movie_videos
  to authenticated;
alter policy interactions_admin_read on public.user_movie_interactions
  to authenticated;
alter policy reviews_admin_write on public.reviews
  to authenticated;
alter policy search_events_admin_read on public.search_events
  to authenticated;
alter policy sync_runs_admin_all on public.sync_runs
  to authenticated;

alter policy movie_emotion_overrides_admin_all
  on public.movie_emotion_overrides to authenticated;
alter policy movie_aliases_admin_write
  on public.movie_aliases to authenticated;
alter policy provider_history_admin_write
  on public.provider_availability_history to authenticated;
alter policy user_preferences_admin_read
  on public.user_preferences to authenticated;
alter policy product_events_own_read
  on public.product_events to authenticated;
alter policy search_feedback_own_read
  on public.search_feedback to authenticated;
alter policy support_requests_own_read
  on public.support_requests to authenticated;
alter policy support_requests_admin_update
  on public.support_requests to authenticated;

commit;
