<div align="center">

# Zoviq

**Your world. Your moment.**

A full-stack social media app with posts, stories, chat, groups and audio/video calls.
Built with Next.js, Supabase and Daily.co.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel)

**[Live demo](https://zoviq-qbgx.vercel.app/auth/login)** 

</div>

---

## Screenshots

> Add screenshots here, for example `docs/feed.png`, `docs/chat.png`, `docs/groups.png`.

---

## Features

**Accounts**
- Sign up, log in and log out with email and password
- Forgot password and reset password by email
- Change password and delete account from Settings
- Edit profile: username, bio and profile picture

**Feed**
- Text, photo and video posts
- Likes and comments
- Share posts and profiles (copy link, WhatsApp, X, Facebook, Telegram, native share)
- Search posts and people with highlighted matches

**Stories**
- Photo and video stories that expire after 24 hours
- All of a user's stories are grouped under one avatar
- Tap to move forward or back, view tracking, delete your own stories

**People**
- Follow and unfollow, follower and following counts

**Messaging**
- One-to-one direct messages with read receipts
- Instant UI update when you send a message

**Groups**
- Public groups (anyone can join) and private groups (admin approves requests)
- Admin can add, remove and approve members and delete the group
- Group chat

**Calls**
- Audio and video calls in direct messages and groups, powered by Daily.co
- Incoming call screen with accept and decline
- Mute, camera toggle, end call, and a mic/camera permission step before joining

**Notifications**
- Likes, comments, follows, messages, group activity and calls
- Unread badges on the navbar and clickable notifications that open the right page

**App experience**
- Light and dark mode that apply to the whole app
- Glass-style navbar with a bottom tab bar on phones
- Installable as a PWA (Add to Home Screen on Android and iOS)

---

## Tech stack

| Area | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS and CSS variables |
| Auth, database, storage | Supabase |
| Calls | Daily.co (`@daily-co/daily-js`) |
| Hosting | Vercel |

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/nafeelahd/zoviq.git
cd zoviq
npm install
```

### 2. Create a Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. Create the database tables listed under [Database](#database).
3. Go to **Storage**, create a **public** bucket named `posts`, and add policies that allow signed-in users to upload and everyone to read.
4. Go to **Authentication > Providers > Email**. Turn **Confirm email** off while developing, or set up custom SMTP so confirmation emails are delivered.

### 3. Create a Daily.co account

1. Sign up at [daily.co](https://www.daily.co) and choose **Daily Video**.
2. Copy your API key from **Developers > API Keys**.

### 4. Add environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
DAILY_API_KEY=your_daily_api_key
```

Never commit `.env.local`. It is already listed in `.gitignore`. If your deployment still uses the old `NEXT_PUBLIC_DAILY_API_KEY` variable, the server accepts it temporarily; replace it with `DAILY_API_KEY` to keep the key private.

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Database

Tables used by the app:

| Table | Purpose |
|---|---|
| `profiles` | `id`, `username`, `bio`, `avatar_url`, `last_seen`, `is_online` |
| `posts` | `user_id`, `content`, `image_url`, `video_url` |
| `likes` | `user_id`, `post_id` (unique pair) |
| `comments` | `user_id`, `post_id`, `content` |
| `follows` | `follower_id`, `following_id` (unique pair) |
| `messages` | `sender_id`, `receiver_id`, `content`, `read` |
| `notifications` | `user_id`, `actor_id`, `type`, `post_id`, `group_id`, `call_room`, `read` |
| `stories` | `user_id`, `image_url`, `video_url`, `expires_at` |
| `story_views` | `story_id`, `viewer_id` (unique pair) |
| `groups` | `name`, `description`, `image_url`, `created_by`, `privacy` |
| `group_members` | `group_id`, `user_id`, `role` |
| `group_requests` | `group_id`, `user_id`, `status` |
| `group_messages` | `group_id`, `user_id`, `content` |

Enable Row Level Security on every table and add policies that match how each table is used. `supabase-setup.sql` in this repo creates the `profiles` table and the trigger that adds a profile row when a user signs up.

---

## Project structure

```
app/
  api/call/route.ts        Creates Daily.co rooms
  auth/                    login, signup, forgot-password, reset-password, callback
  feed/                    Home feed with stories and posts
  profile/                 Profile and edit profile
  people/                  Discover and follow people
  search/                  Search posts and people
  notifications/           Notification list
  messages/                Direct messages and calls
  groups/                  Groups, group chat and group calls
  settings/change-password/
  globals.css              Design tokens, animations, dark mode
  layout.tsx               Root layout and PWA setup
components/
  Navbar.tsx               Top bar, bottom tab bar, settings menu
  Stories.tsx              Story row and viewer
  ShareModal.tsx           Share sheet
  VideoEditor.tsx          Video preview and trim-point selector
  CallModal.tsx            Active call screen
  IncomingCall.tsx         Incoming call screen
lib/
  supabase/client.ts       Browser Supabase client
  supabase/server.ts       Server Supabase client
  useTheme.ts              Light and dark mode hook
public/
  manifest.json, sw.js, icon-192.png, icon-512.png    PWA files
```

---

## Deploying to Vercel

1. Push the project to GitHub.
2. Import the repository at [vercel.com](https://vercel.com).
3. Add the three environment variables from `.env.local` before deploying. Keep `DAILY_API_KEY` server-only; do not prefix it with `NEXT_PUBLIC_`.
4. Deploy.
5. In Supabase, go to **Authentication > URL Configuration**. Set the **Site URL** to your Vercel URL and add `https://your-app.vercel.app/auth/callback` and `https://your-app.vercel.app/auth/reset-password` to the **Redirect URLs**.

Vercel runs a strict TypeScript build, so run `npm run build` locally first to catch type errors before you push.

---

## Install as an app (PWA)

**Android (Chrome):** open the site, tap the menu (three dots), then **Add to Home screen**.

**iPhone (Safari):** open the site, tap **Share**, then **Add to Home Screen**.

---

## Known limitations

- Chat messages and navbar badges refresh by polling (messages every 2 seconds, badges every 10 seconds) rather than by live push.
- Incoming direct and group calls are detected on the Messages page, so the other person sees the ringing screen only while that page is open.
- The video editor lets you pick trim points, but the uploaded file is not cut yet.
- Delete account removes the user's data and signs them out. Removing the auth user itself needs a server-side admin call.
- Some Row Level Security policies for groups, stories and notifications are open so development is easy. Tighten them before real users sign up.
- Calls use the server-only `DAILY_API_KEY` environment variable. Add it to your local `.env.local` and deployment environment; never expose it with the `NEXT_PUBLIC_` prefix. The old `NEXT_PUBLIC_DAILY_API_KEY` name is temporarily supported for existing deployments.

---

## Roadmap

- [ ] Last seen and online or offline status
- [ ] Typing indicators
- [ ] Image messages in chat
- [ ] Real video trimming
- [ ] Push notifications
- [ ] Restyled auth pages and popups to match the new design
- [ ] Android APK build

---

## Author

Built by [@nafeelahd](https://github.com/nafeelahd).

## License

MIT. Change this if you prefer a different license.
