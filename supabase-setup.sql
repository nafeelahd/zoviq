-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)

-- Profiles table (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  bio text,
  avatar_url text,
  last_seen timestamp with time zone,
  created_at timestamp with time zone default now()
);

alter table public.profiles
  add column if not exists last_seen timestamp with time zone;

-- Run this setup again after creating the messages table to add media attachments.
do $$
begin
  if to_regclass('public.messages') is not null then
    alter table public.messages add column if not exists image_url text;
    alter table public.messages add column if not exists video_url text;
  end if;
end;
$$;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default now()
);

alter table public.push_subscriptions enable row level security;

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    new.raw_user_meta_data->>'username'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Allow users to read all profiles
drop policy if exists "Profiles are viewable by everyone" on profiles;
create policy "Profiles are viewable by everyone"
  on profiles for select using (true);

-- Allow users to update only their own profile
drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);
