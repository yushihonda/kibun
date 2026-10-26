begin;

-- Anonymous visitors cannot execute is_admin(), so they get their own policy
-- that only needs the moderation flag.
drop policy comments_public_read on public.comments;

create policy comments_anon_read on public.comments
  for select to anon
  using (hidden_at is null);

create policy comments_authenticated_read on public.comments
  for select to authenticated
  using (hidden_at is null or user_id = (select auth.uid()) or public.is_admin());

commit;
