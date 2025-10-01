-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.Admins (
  admin_id integer NOT NULL DEFAULT nextval('"Admins_admin_id_seq"'::regclass),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  CONSTRAINT Admins_pkey PRIMARY KEY (admin_id)
);
CREATE TABLE public.Category (
  category_id integer NOT NULL DEFAULT nextval('"Category_category_id_seq"'::regclass),
  category_name character varying NOT NULL,
  CONSTRAINT Category_pkey PRIMARY KEY (category_id)
);
CREATE TABLE public.Episodes (
  episode_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  season_id integer NOT NULL,
  serie_id integer NOT NULL,
  episode_number integer NOT NULL,
  episode_title character varying NOT NULL,
  episode_description text,
  duration integer,
  release_date date,
  download_url character varying,
  rating numeric,
  image_url character varying,
  tmdb_id integer,
  download_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT Episodes_pkey PRIMARY KEY (episode_id),
  CONSTRAINT Episodes_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.Season(season_id),
  CONSTRAINT Episodes_serie_id_fkey FOREIGN KEY (serie_id) REFERENCES public.Serie(serie_id)
);
CREATE TABLE public.Genre (
  genre_id integer NOT NULL DEFAULT nextval('"Genre_genre_id_seq"'::regclass),
  genre character varying NOT NULL,
  CONSTRAINT Genre_pkey PRIMARY KEY (genre_id)
);
CREATE TABLE public.ImportHistory (
  import_id integer NOT NULL DEFAULT nextval('"ImportHistory_import_id_seq"'::regclass),
  file_name text NOT NULL,
  total_rows integer NOT NULL,
  added_movies integer NOT NULL,
  duplicates integer NOT NULL,
  import_date timestamp with time zone DEFAULT now(),
  import_details jsonb,
  enrichment_success integer,
  enrichment_partial integer,
  enrichment_failed integer,
  enrichment_details jsonb,
  CONSTRAINT ImportHistory_pkey PRIMARY KEY (import_id)
);
CREATE TABLE public.MovieGenres (
  id integer NOT NULL DEFAULT nextval('"MovieGenres_id_seq"'::regclass),
  movie_id integer,
  genre_id integer,
  CONSTRAINT MovieGenres_pkey PRIMARY KEY (id),
  CONSTRAINT MovieGenres_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.Movies(movie_id),
  CONSTRAINT MovieGenres_genre_id_fkey FOREIGN KEY (genre_id) REFERENCES public.Genre(genre_id)
);
CREATE TABLE public.Movies (
  movie_id integer NOT NULL DEFAULT nextval('"Movies_movie_id_seq"'::regclass),
  movie_title character varying NOT NULL,
  release_year integer,
  release_date date,
  download_url character varying,
  plot text,
  duration integer,
  rating numeric,
  image_url character varying,
  trailer character varying,
  tmdb_id integer,
  type_id integer,
  category_id integer,
  download_count integer DEFAULT 0,
  CONSTRAINT Movies_pkey PRIMARY KEY (movie_id),
  CONSTRAINT Movies_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.Types(type_id),
  CONSTRAINT Movies_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.Category(category_id)
);
CREATE TABLE public.Season (
  season_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  serie_id integer NOT NULL,
  season_number integer NOT NULL,
  season_title character varying,
  season_description text,
  episode_count integer DEFAULT 0,
  image_url character varying,
  trailer character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT Season_pkey PRIMARY KEY (season_id),
  CONSTRAINT Season_serie_id_fkey FOREIGN KEY (serie_id) REFERENCES public.Serie(serie_id)
);
CREATE TABLE public.Serie (
  serie_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  serie_title character varying NOT NULL,
  description text,
  release_year integer,
  total_seasons integer DEFAULT 0,
  total_episodes integer DEFAULT 0,
  rating numeric,
  image_url character varying,
  trailer character varying,
  type_id integer,
  tmdb_id integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT Serie_pkey PRIMARY KEY (serie_id),
  CONSTRAINT Serie_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.Types(type_id)
);
CREATE TABLE public.SeriesGenres (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  serie_id integer NOT NULL,
  genre_id integer NOT NULL,
  CONSTRAINT SeriesGenres_pkey PRIMARY KEY (id),
  CONSTRAINT SeriesGenres_serie_id_fkey FOREIGN KEY (serie_id) REFERENCES public.Serie(serie_id),
  CONSTRAINT SeriesGenres_genre_id_fkey FOREIGN KEY (genre_id) REFERENCES public.Genre(genre_id)
);
CREATE TABLE public.Types (
  type_id integer NOT NULL DEFAULT nextval('"Types_type_id_seq"'::regclass),
  type character varying NOT NULL,
  CONSTRAINT Types_pkey PRIMARY KEY (type_id)
);