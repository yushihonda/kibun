begin;

alter function public.search_movies(
  text,
  text[],
  public.offer_type[],
  integer,
  numeric,
  text[],
  boolean,
  integer,
  integer
) security definer;

commit;
