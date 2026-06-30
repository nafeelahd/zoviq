-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)

-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  bio text,
  avatar_url text,
  created_at timestamp with time zone default now()
);

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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Allow users to read all profiles
create policy "Profiles are viewable by everyone"
  on profiles for select using (true);

-- Allow users to update only their own profile
create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);
