begin;

alter table public.movies
  add column if not exists original_language text not null default '',
  add column if not exists origin_countries text[] not null default '{}';

create index if not exists movies_original_language_idx
  on public.movies (original_language);
create index if not exists movies_origin_countries_idx
  on public.movies using gin (origin_countries);

create or replace function public.set_movie_search_text()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.search_text := btrim(concat_ws(
    ' ',
    new.title,
    new.original_title,
    new.overview,
    array_to_string(new.genres, ' '),
    array_to_string(new.emotional_tags, ' '),
    case
      when new.original_language = 'ja' or new.origin_countries && array['JP']
        then '邦画 日本映画 日本作品'
    end,
    case
      when new.original_language = 'ko' or new.origin_countries && array['KR']
        then '韓国映画 韓流 韓国作品 K-Movie'
    end
  ));
  return new;
end;
$$;

drop trigger if exists movies_search_text_before_write on public.movies;
create trigger movies_search_text_before_write
before insert or update of
  title,
  original_title,
  overview,
  genres,
  emotional_tags,
  original_language,
  origin_countries
on public.movies for each row execute function public.set_movie_search_text();

update public.movies
set original_language = original_language;

commit;
