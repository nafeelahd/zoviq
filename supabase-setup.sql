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

do $$
begin
  if to_regclass('public.notifications') is not null then
    alter table public.notifications
      add column if not exists call_room text;
  end if;
end;
$$;

-- Run this setup again after creating the messages table to add media attachments.
do $$
begin
  if to_regclass('public.messages') is not null then
    alter table public.messages add column if not exists image_url text;
    alter table public.messages add column if not exists video_url text;
    alter table public.messages add column if not exists audio_url text;
  end if;

  if to_regclass('public.group_messages') is not null then
    alter table public.group_messages add column if not exists audio_url text;
  end if;
end;
$$;

create table if not exists public.message_hidden_for (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_type text not null check (message_type in ('direct', 'group')),
  conversation_id text not null,
  message_id text not null,
  created_at timestamp with time zone not null default now(),
  primary key (user_id, message_type, conversation_id, message_id)
);

alter table public.message_hidden_for enable row level security;
grant select, insert, delete on public.message_hidden_for to authenticated;

drop policy if exists "Users can view their hidden messages" on public.message_hidden_for;
create policy "Users can view their hidden messages"
  on public.message_hidden_for for select using (auth.uid() = user_id);

drop policy if exists "Users can hide messages for themselves" on public.message_hidden_for;
create policy "Users can hide messages for themselves"
  on public.message_hidden_for for insert with check (auth.uid() = user_id);

drop policy if exists "Users can unhide messages for themselves" on public.message_hidden_for;
create policy "Users can unhide messages for themselves"
  on public.message_hidden_for for delete using (auth.uid() = user_id);

do $$
begin
  if to_regclass('public.messages') is not null then
    execute 'drop policy if exists "Users can delete their own messages" on public.messages';
    execute 'create policy "Users can delete their own messages" on public.messages for delete using (auth.uid() = sender_id)';
  end if;

  if to_regclass('public.group_messages') is not null then
    execute 'drop policy if exists "Users can delete their own group messages" on public.group_messages';
    execute 'create policy "Users can delete their own group messages" on public.group_messages for delete using (auth.uid() = user_id)';
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
