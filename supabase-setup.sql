-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)

-- Profiles table (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  bio text,
  avatar_url text,
  last_seen timestamp with time zone,
  is_private boolean not null default false,
  created_at timestamp with time zone default now()
);

alter table public.profiles
  add column if not exists last_seen timestamp with time zone;
alter table public.profiles
  add column if not exists is_private boolean not null default false;

create table if not exists public.follow_requests (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

alter table public.follow_requests enable row level security;
grant select, insert, delete on public.follow_requests to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    execute $constraint$
      alter table public.profiles
      add constraint profiles_username_format
      check (username ~ '^[a-z0-9_]{3,30}$') not valid
    $constraint$;
  end if;
end;
$$;

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
    alter table public.group_messages add column if not exists image_url text;
    alter table public.group_messages add column if not exists video_url text;
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

drop policy if exists "Users can delete their own message attachments" on storage.objects;
create policy "Users can delete their own message attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'posts'
    and (
      name like ('messages/' || auth.uid()::text || '/%')
      or name like ('group-messages/' || auth.uid()::text || '/%')
    )
  );

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default now()
);

alter table public.push_subscriptions enable row level security;

create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  window_started_at timestamp with time zone not null,
  request_count integer not null check (request_count > 0)
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;

create or replace function public.prevent_push_subscription_reassignment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'Push subscriptions cannot be reassigned to another user';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_push_subscription_reassignment() from public, anon, authenticated;
drop trigger if exists push_subscription_owner_immutable on public.push_subscriptions;
create trigger push_subscription_owner_immutable
  before update on public.push_subscriptions
  for each row execute procedure public.prevent_push_subscription_reassignment();

create or replace function public.consume_api_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_count integer;
begin
  if p_bucket_key is null or length(p_bucket_key) < 1 or length(p_bucket_key) > 160
      or p_max_requests < 1 or p_max_requests > 1000
      or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit parameters';
  end if;

  insert into public.api_rate_limits as current_bucket (bucket_key, window_started_at, request_count)
  values (p_bucket_key, clock_timestamp(), 1)
  on conflict (bucket_key) do update
  set window_started_at = case
        when current_bucket.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
          then clock_timestamp()
        else current_bucket.window_started_at
      end,
      request_count = case
        when current_bucket.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
          then 1
        else current_bucket.request_count + 1
      end
  returning request_count into current_count;

  return current_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_username text;
begin
  new_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  if new_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Username must be 3-30 characters using letters, numbers, and underscores';
  end if;

  insert into public.profiles (id, username) values (new.id, new_username);
  return new;
end;
$$ language plpgsql security definer set search_path = pg_catalog, public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
revoke all on function public.handle_new_user() from public, anon, authenticated;

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

-- Rerunning this section replaces policies for app-owned tables with an explicit
-- least-privilege policy set. Keep service-role operations server-side.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'profiles', 'posts', 'likes', 'comments', 'follows', 'follow_requests', 'messages',
    'notifications', 'stories', 'story_views', 'groups', 'group_members',
    'group_requests', 'group_messages', 'message_hidden_for', 'push_subscriptions',
    'api_rate_limits'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      for policy_name in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = table_name
      loop
        execute format('drop policy %I on public.%I', policy_name, table_name);
      end loop;
    end if;
  end loop;
end;
$$;

do $$
begin
  if to_regclass('public.group_members') is not null and to_regclass('public.groups') is not null then
    execute $function$
      create or replace function public.is_group_member(target_group uuid, target_user uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = pg_catalog, public
      as $body$
        select exists (
          select 1 from public.group_members
          where group_id = target_group and user_id = target_user
        )
      $body$
    $function$;
    execute $function$
      create or replace function public.is_group_admin(target_group uuid, target_user uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = pg_catalog, public
      as $body$
        select exists (
          select 1 from public.groups
          where id = target_group and created_by = target_user
        ) or exists (
          select 1 from public.group_members
          where group_id = target_group and user_id = target_user and role = 'admin'
        )
      $body$
    $function$;
    execute 'revoke all on function public.is_group_member(uuid, uuid) from public';
    execute 'revoke all on function public.is_group_admin(uuid, uuid) from public';
    execute 'grant execute on function public.is_group_member(uuid, uuid) to authenticated';
    execute 'grant execute on function public.is_group_admin(uuid, uuid) to authenticated';
  end if;
end;
$$;

create policy "Profiles are publicly viewable" on public.profiles
  for select using (true);
create policy "Users update their own profiles" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
revoke insert, delete on public.profiles from anon, authenticated;

create or replace function public.can_view_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() = target_profile_id
    or exists (
      select 1
      from public.profiles p
      where p.id = target_profile_id
        and (
          not p.is_private
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = target_profile_id
          )
        )
    )
$$;
revoke all on function public.can_view_profile(uuid) from public, anon;
grant execute on function public.can_view_profile(uuid) to authenticated;

create or replace function public.can_view_profile_media(owner_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id::text = owner_id
      and (
        auth.uid() = p.id
        or not p.is_private
        or exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.following_id = p.id
        )
      )
  )
$$;
revoke all on function public.can_view_profile_media(text) from public, anon;
grant execute on function public.can_view_profile_media(text) to authenticated;

create or replace function public.accept_follow_request(requester_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or requester_id = auth.uid() or not exists (
    select 1 from public.follow_requests r
    where r.follower_id = requester_id and r.following_id = auth.uid()
  ) then
    raise exception 'Follow request not found';
  end if;

  insert into public.follows (follower_id, following_id)
  values (requester_id, auth.uid())
  on conflict (follower_id, following_id) do nothing;

  delete from public.follow_requests
  where follower_id = requester_id and following_id = auth.uid();
end;
$$;
revoke all on function public.accept_follow_request(uuid) from public, anon;
grant execute on function public.accept_follow_request(uuid) to authenticated;

create policy "Posts are publicly viewable" on public.posts
  for select using (public.can_view_profile(user_id));
create policy "Users create their own posts" on public.posts
  for insert with check (auth.uid() = user_id);
create policy "Users update their own posts" on public.posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete their own posts" on public.posts
  for delete using (auth.uid() = user_id);

create policy "Likes are publicly viewable" on public.likes
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and public.can_view_profile(p.user_id)
    )
  );
create policy "Users create their own likes" on public.likes
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.posts p
      where p.id = post_id and public.can_view_profile(p.user_id)
    )
  );
create policy "Users remove their own likes" on public.likes
  for delete using (auth.uid() = user_id);

create policy "Comments are publicly viewable" on public.comments
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and public.can_view_profile(p.user_id)
    )
  );
create policy "Users create their own comments" on public.comments
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.posts p
      where p.id = post_id and public.can_view_profile(p.user_id)
    )
  );
create policy "Users delete their own comments" on public.comments
  for delete using (auth.uid() = user_id);

create policy "Follows are publicly viewable" on public.follows
  for select using (true);
create policy "Users follow from their own account" on public.follows
  for insert with check (
    auth.uid() = follower_id and follower_id <> following_id
    and exists (
      select 1 from public.profiles p
      where p.id = following_id and not p.is_private
    )
  );
create policy "Users unfollow from their own account" on public.follows
  for delete using (auth.uid() = follower_id);

create policy "Users view follow requests they are part of" on public.follow_requests
  for select using (auth.uid() = follower_id or auth.uid() = following_id);
create policy "Users request to follow private accounts" on public.follow_requests
  for insert with check (
    auth.uid() = follower_id and follower_id <> following_id
    and exists (
      select 1 from public.profiles p
      where p.id = following_id and p.is_private
    )
  );
create policy "Requesters and recipients remove follow requests" on public.follow_requests
  for delete using (auth.uid() = follower_id or auth.uid() = following_id);

create policy "Conversation participants view messages" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Users send messages as themselves" on public.messages
  for insert with check (auth.uid() = sender_id and sender_id <> receiver_id);
create policy "Recipients update message read state" on public.messages
  for update using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);
create policy "Senders delete their own messages for everyone" on public.messages
  for delete using (auth.uid() = sender_id);
revoke update on public.messages from anon, authenticated;
grant update (read) on public.messages to authenticated;

create policy "Users view their notifications" on public.notifications
  for select using (auth.uid() = user_id);
create policy "Users update their notification read state" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete notifications involving them" on public.notifications
  for delete using (auth.uid() = user_id or auth.uid() = actor_id);

create policy "Users create notifications for real actions" on public.notifications
  for insert with check (
    actor_id = auth.uid() and user_id <> auth.uid() and (
      (type = 'like' and exists (
        select 1 from public.posts p join public.likes l on l.post_id = p.id
        where p.id = notifications.post_id
          and p.user_id = notifications.user_id and l.user_id = auth.uid()
      ))
      or (type = 'comment' and exists (
        select 1 from public.posts p join public.comments c on c.post_id = p.id
        where p.id = notifications.post_id
          and p.user_id = notifications.user_id and c.user_id = auth.uid()
      ))
      or (type = 'follow' and exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.following_id = notifications.user_id
      ))
      or (type = 'message' and exists (
        select 1 from public.messages m
        where m.sender_id = auth.uid() and m.receiver_id = notifications.user_id
      ))
      or (type = 'group_message' and notifications.group_id is not null and
        public.is_group_member(notifications.group_id, auth.uid()) and
        public.is_group_member(notifications.group_id, notifications.user_id) and exists (
          select 1 from public.group_messages gm
          where gm.group_id = notifications.group_id and gm.user_id = auth.uid()
        ))
      or (type = 'group_join' and notifications.group_id is not null and
        public.is_group_member(notifications.group_id, auth.uid()) and exists (
          select 1 from public.groups g
          where g.id = notifications.group_id and g.created_by = notifications.user_id
        ))
      or (type = 'group_request' and notifications.group_id is not null and exists (
        select 1 from public.group_requests r
        join public.groups g on g.id = r.group_id
        where r.group_id = notifications.group_id and r.user_id = auth.uid()
          and g.created_by = notifications.user_id and r.status = 'pending'
      ))
      or (type = 'group_accepted' and notifications.group_id is not null and
        public.is_group_member(notifications.group_id, auth.uid()) and
        public.is_group_member(notifications.group_id, notifications.user_id))
      or (type = 'group_added' and notifications.group_id is not null and
        public.is_group_admin(notifications.group_id, auth.uid()) and
        public.is_group_member(notifications.group_id, notifications.user_id))
      or (type = 'group_removed' and notifications.group_id is not null and
        public.is_group_admin(notifications.group_id, auth.uid()) and
        exists (select 1 from public.profiles p where p.id = notifications.user_id))
    )
  );
revoke update on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

create policy "Users view unexpired stories" on public.stories
  for select using (expires_at > now() and public.can_view_profile(user_id));
create policy "Users create their own stories" on public.stories
  for insert with check (auth.uid() = user_id);
create policy "Users delete their own stories" on public.stories
  for delete using (auth.uid() = user_id);

create policy "Viewers and story owners can see story views" on public.story_views
  for select using (
    auth.uid() = viewer_id
    or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
  );
create policy "Users record their own story views" on public.story_views
  for insert with check (
    auth.uid() = viewer_id
    and exists (
      select 1 from public.stories s
      where s.id = story_id and s.user_id <> auth.uid()
        and s.expires_at > now() and public.can_view_profile(s.user_id)
    )
  );
create policy "Users update their own story views" on public.story_views
  for update using (auth.uid() = viewer_id) with check (auth.uid() = viewer_id);
grant update (story_id, viewer_id) on public.story_views to authenticated;

create policy "Users view groups" on public.groups
  for select using (true);
create policy "Users create groups as themselves" on public.groups
  for insert with check (auth.uid() = created_by);
create policy "Group owners update their groups" on public.groups
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy "Group owners delete their groups" on public.groups
  for delete using (auth.uid() = created_by);

create policy "Users view public group rosters and their own groups" on public.group_members
  for select using (
    public.is_group_member(group_id, auth.uid())
    or public.is_group_admin(group_id, auth.uid())
    or exists (select 1 from public.groups g where g.id = group_id and g.privacy = 'public')
  );
create policy "Users join public groups or owners add members" on public.group_members
  for insert with check (
    (user_id = auth.uid() and role = 'member'
      and exists (select 1 from public.groups g where g.id = group_id and g.privacy = 'public'))
    or (user_id = auth.uid() and role = 'admin'
      and exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid()))
    or (role = 'member' and public.is_group_admin(group_id, auth.uid()))
  );
create policy "Group admins update memberships" on public.group_members
  for update using (public.is_group_admin(group_id, auth.uid()))
  with check (public.is_group_admin(group_id, auth.uid()));
create policy "Users leave groups and admins remove members" on public.group_members
  for delete using (user_id = auth.uid() or public.is_group_admin(group_id, auth.uid()));
revoke update on public.group_members from anon, authenticated;
grant update (group_id, user_id, role) on public.group_members to authenticated;

create policy "Users and group admins view join requests" on public.group_requests
  for select using (user_id = auth.uid() or public.is_group_admin(group_id, auth.uid()));
create policy "Users request access to private groups" on public.group_requests
  for insert with check (
    user_id = auth.uid()
    and status = 'pending'
    and not public.is_group_member(group_id, auth.uid())
    and exists (select 1 from public.groups g where g.id = group_id and g.privacy = 'private')
  );
create policy "Users retry and admins decide join requests" on public.group_requests
  for update using (
    (user_id = auth.uid() and status = 'pending')
    or public.is_group_admin(group_id, auth.uid())
  )
  with check (
    (user_id = auth.uid() and status = 'pending'
      and not public.is_group_member(group_id, auth.uid())
      and exists (select 1 from public.groups g where g.id = group_id and g.privacy = 'private'))
    or public.is_group_admin(group_id, auth.uid())
  );
create policy "Users cancel and admins remove join requests" on public.group_requests
  for delete using (user_id = auth.uid() or public.is_group_admin(group_id, auth.uid()));
revoke update on public.group_requests from anon, authenticated;
grant update (group_id, user_id, status) on public.group_requests to authenticated;

create policy "Group members view group messages" on public.group_messages
  for select using (public.is_group_member(group_id, auth.uid()));
create policy "Group members send messages as themselves" on public.group_messages
  for insert with check (
    auth.uid() = user_id and public.is_group_member(group_id, auth.uid())
  );
create policy "Authors and group admins delete group messages" on public.group_messages
  for delete using (
    auth.uid() = user_id or public.is_group_admin(group_id, auth.uid())
  );

create policy "Users view their hidden message markers" on public.message_hidden_for
  for select using (auth.uid() = user_id);
create policy "Users hide messages for themselves" on public.message_hidden_for
  for insert with check (auth.uid() = user_id);
create policy "Users unhide messages for themselves" on public.message_hidden_for
  for delete using (auth.uid() = user_id);
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.api_rate_limits from public, anon, authenticated;

create or replace function public.owns_post_media(object_name text)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select auth.uid() is not null and (
    object_name like (auth.uid()::text || '/%')
    or object_name like ('avatars/' || auth.uid()::text || '/%')
    or object_name like ('stories/' || auth.uid()::text || '/%')
    or object_name like ('messages/' || auth.uid()::text || '/%')
    or object_name like ('group-messages/' || auth.uid()::text || '/%')
    or object_name like ('groups/' || auth.uid()::text || '/%')
  )
$$;

revoke all on function public.owns_post_media(text) from public;
grant execute on function public.owns_post_media(text) to anon, authenticated;

drop policy if exists "Authenticated users manage their own post media" on storage.objects;
create policy "Authenticated users manage their own post media"
  on storage.objects for all to authenticated
  using (bucket_id = 'posts' and public.owns_post_media(name))
  with check (bucket_id = 'posts' and public.owns_post_media(name));

insert into storage.buckets (id, name, public)
values ('private-posts', 'private-posts', false)
on conflict (id) do update set public = false;

drop policy if exists "Users view authorized private profile media" on storage.objects;
create policy "Users view authorized private profile media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'private-posts'
    and public.can_view_profile_media(split_part(name, '/', 1))
  );

drop policy if exists "Users manage their private profile media" on storage.objects;
create policy "Users manage their private profile media"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'private-posts'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'private-posts'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "Restrict post media uploads to owners" on storage.objects;
create policy "Restrict post media uploads to owners"
  on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'posts' or (auth.uid() is not null and public.owns_post_media(name)));

drop policy if exists "Restrict post media updates to owners" on storage.objects;
create policy "Restrict post media updates to owners"
  on storage.objects as restrictive for update to public
  using (bucket_id <> 'posts' or (auth.uid() is not null and public.owns_post_media(name)))
  with check (bucket_id <> 'posts' or (auth.uid() is not null and public.owns_post_media(name)));

drop policy if exists "Restrict post media deletes to owners" on storage.objects;
create policy "Restrict post media deletes to owners"
  on storage.objects as restrictive for delete to public
  using (bucket_id <> 'posts' or (auth.uid() is not null and public.owns_post_media(name)));
