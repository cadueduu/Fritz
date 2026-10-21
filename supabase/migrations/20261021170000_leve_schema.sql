-- Leve: per-user data. Every row belongs to auth.uid() and RLS keeps users apart.
-- Already applied to the Supabase project "Fitz"; kept here for reference and new environments.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  plan_mode text not null default 'auto' check (plan_mode in ('nutro', 'auto')),
  diet_goals jsonb,
  diet_meals jsonb,
  body jsonb,
  updated_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  time text not null,
  meal text not null check (meal in ('cafe', 'lanche1', 'almoco', 'lanche2', 'jantar', 'extra')),
  title text not null,
  description text not null default '',
  kcal numeric not null default 0,
  p numeric not null default 0,
  c numeric not null default 0,
  g numeric not null default 0,
  f numeric not null default 0,
  fora boolean not null default false,
  photo boolean not null default false,
  thumb text,
  mult numeric not null default 1,
  created_at timestamptz not null default now()
);
create index entries_user_day_idx on public.entries (user_id, day);

create table public.water (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  cups smallint not null check (cups between 0 and 8),
  primary key (user_id, day)
);

create table public.weights (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  kg numeric(5, 1) not null check (kg > 20 and kg < 400),
  primary key (user_id, day)
);

create table public.messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender text not null check (sender in ('user', 'agent')),
  text text not null,
  created_at timestamptz not null default now()
);
create index messages_user_created_idx on public.messages (user_id, created_at);

alter table public.profiles enable row level security;
alter table public.entries enable row level security;
alter table public.water enable row level security;
alter table public.weights enable row level security;
alter table public.messages enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own entries" on public.entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own water" on public.water for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own weights" on public.weights for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own messages" on public.messages for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- create the profile when someone signs up, with the name typed on the sign-up screen
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- diet proposed by the agent in that message, applied only when the user taps "Usar esta dieta"
alter table public.messages add column diet jsonb;

-- actions the agent proposed in a message (diet, meal, weight, water); each needs the user's tap to apply.
-- `diet` above is superseded by `actions` (its rows were copied over) and is no longer written.
alter table public.messages add column actions jsonb;
update public.messages set actions = jsonb_build_array(diet || '{"type":"dieta"}'::jsonb) where diet is not null;

-- answers from the post-sign-up questionnaire (goal weight, exercise, daily routine, food preferences)
alter table public.profiles add column onboarding jsonb;
alter table public.profiles add column onboarded_at timestamptz;

-- sign-up also sends body data (birth date, sex, height, weight); keep it in the profile and
-- record the weight as the first weigh-in
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b jsonb := new.raw_user_meta_data -> 'body';
  kg numeric := nullif(b ->> 'peso', '')::numeric;
begin
  insert into public.profiles (user_id, name, body)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), b);
  if kg > 20 and kg < 400 then
    -- the app's days are local (Brazil), not UTC
    insert into public.weights (user_id, day, kg) values (new.id, (now() at time zone 'America/Sao_Paulo')::date, round(kg, 1));
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
