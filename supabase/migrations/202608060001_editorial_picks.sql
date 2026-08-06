-- Editorial curation picks (public "編集部のおすすめ"), separate from user favorites/reviews.

create table if not exists public.editorial_picks (
  id uuid primary key default extensions.gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  is_featured boolean not null default true,
  sort_order integer not null default 0,
  comment text not null default '' check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (movie_id)
);

create index if not exists editorial_picks_featured_sort_idx
  on public.editorial_picks (is_featured, sort_order asc, updated_at desc);

create trigger editorial_picks_updated_at
before update on public.editorial_picks
for each row execute function public.set_updated_at();

alter table public.editorial_picks enable row level security;

create policy editorial_picks_public_read on public.editorial_picks
for select to anon, authenticated using (is_featured = true);

create policy editorial_picks_admin_write on public.editorial_picks
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select on public.editorial_picks to anon, authenticated;
grant insert, update, delete on public.editorial_picks to authenticated;
grant all on public.editorial_picks to service_role;
