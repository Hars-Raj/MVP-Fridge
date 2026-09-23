-- Run once in the Supabase SQL editor, then run seed.sql.
create table public.places (
 id text primary key, name text not null, description text, category text, cuisine text,
 address text, latitude double precision, longitude double precision,
 price_level int check(price_level between 1 and 4), tags text[] not null default '{}',
 cover_image text, source text, opening_hours jsonb, contact text, website text,
 reservation_url text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '', bio text default '', preferences jsonb not null default '{}'
);
create table public.reviews (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 place_id text not null references public.places(id), rating int not null check(rating between 1 and 5),
 body text not null check(length(body) between 1 and 3000), created_at timestamptz default now(),
 unique(user_id,place_id)
);
create table public.saves (
 user_id uuid references auth.users(id) on delete cascade,
 place_id text references public.places(id), created_at timestamptz default now(),
 primary key(user_id,place_id)
);
create table public.searches (
 user_id uuid references auth.users(id) on delete cascade, query text not null check(length(query) between 1 and 200),
 created_at timestamptz default now(), primary key(user_id,query)
);
alter table public.places enable row level security;
alter table public.profiles enable row level security;
alter table public.reviews enable row level security;
alter table public.saves enable row level security;
alter table public.searches enable row level security;
create policy "read places" on public.places for select using(true);
create policy "read reviews" on public.reviews for select using(true);
create policy "own reviews" on public.reviews for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own profile" on public.profiles for all to authenticated using(auth.uid()=id) with check(auth.uid()=id);
create policy "own saves" on public.saves for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own searches" on public.searches for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select on public.places,public.reviews to anon,authenticated;
grant select,insert,update,delete on public.profiles,public.reviews,public.saves,public.searches to authenticated;
