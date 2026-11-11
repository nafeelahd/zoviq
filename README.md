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

**[Live demo](https://zoviq-18.vercel.app/auth/login)** 

</div>


---

## Features

**Accounts**
- Sign up, log in and log out with email and password
- Forgot password and reset password by email
- Change password and delete account from Settings
- Edit profile: username, bio and profile picture

**Feed**
- Text, photo and video posts
- Capture photos and videos with audio directly from the camera; mute video audio before posting
- Trim and transcode video clips before uploading
- Likes and comments
- Share posts and profiles (copy link, WhatsApp, X, Facebook, Telegram, native share)
- Search posts and people with highlighted matches

**Stories**
- Photo and video stories that expire after 24 hours
- Preview selected and recorded videos, optionally mute them, and capture new photos/videos with audio
- All of a user's stories are grouped under one avatar
- Tap to move forward or back, view tracking, delete your own stories

**People**
- Follow and unfollow, follower and following counts

**Messaging**
- One-to-one direct messages with read receipts
- Instant UI update when you send a message
- Online status and last-seen timestamps
- Live typing indicators
- Image and video attachments in direct messages (up to 10 MB per image and 50 MB per video)

**Groups**
- Public groups (anyone can join) and private groups (admin approves requests)
- Admin can add, remove and approve members and delete the group
- Group chat

**Calls**
- Audio and video calls in direct messages and groups, powered by Daily.co
- Private Daily rooms with authenticated, room-scoped meeting tokens
- Incoming call screen with accept and decline
- Mute, camera toggle, end call, and a mic/camera permission step before joining

**Notifications**
- Likes, comments, follows, messages, group activity and calls
- Optional web push notifications for background alerts
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
3. Go to **Storage** and create a **public** bucket named `posts`. Run the setup SQL after creating all application tables to apply owner-scoped write policies. Public bucket objects remain readable by anyone with their URL.
4. Go to **Authentication > Providers > Email** and keep email confirmation enabled in production. Configure custom SMTP so confirmation and password-reset emails are delivered.

### 3. Create a Daily.co account

1. Sign up at [daily.co](https://www.daily.co) and choose **Daily Video**.
2. Copy your API key from **Developers > API Keys**.

### 4. Add environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
DAILY_API_KEY=your_daily_api_key
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:you@example.com
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Generate the VAPID pair with `npx web-push generate-vapid-keys`. Keep `DAILY_API_KEY`, `VAPID_PRIVATE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` server-only; never use the `NEXT_PUBLIC_` prefix for them. The service-role key is available in your Supabase project's API settings and is used by the server for privileged operations. Never commit `.env.local`; it is already listed in `.gitignore`. If `NEXT_PUBLIC_DAILY_API_KEY` was ever configured, rotate that key because it may have been exposed in browser bundles, remove it from all environments, and use only `DAILY_API_KEY`.

Push notifications require HTTPS (localhost is allowed for development), VAPID keys, and the Supabase service-role key. After setting the variables, restart or redeploy the app, sign in, and select **Settings → Turn on push notifications**. Run `supabase-setup.sql` after creating all application tables. It creates server-managed push-subscription and message-visibility tables, adds attachment columns, and installs the app's row-level and storage policies.

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
| `profiles` | `id`, `username`, `bio`, `avatar_url`, `last_seen` |
| `posts` | `user_id`, `content`, `image_url`, `video_url` |
| `likes` | `user_id`, `post_id` (unique pair) |
| `comments` | `user_id`, `post_id`, `content` |
| `follows` | `follower_id`, `following_id` (unique pair) |
| `messages` | `sender_id`, `receiver_id`, `content`, `image_url`, `video_url`, `audio_url`, `read` |
| `message_hidden_for` | `user_id`, `message_type`, `conversation_id`, `message_id` (created by `supabase-setup.sql`) |
| `notifications` | `user_id`, `actor_id`, `type`, `post_id`, `group_id`, `call_room`, `read` |
| `push_subscriptions` | `user_id`, `endpoint`, `p256dh`, `auth` (created by `supabase-setup.sql`) |
| `api_rate_limits` | Server-only API request windows (created by `supabase-setup.sql`) |
| `stories` | `user_id`, `image_url`, `video_url`, `expires_at` |
| `story_views` | `story_id`, `viewer_id` (unique pair) |
| `groups` | `name`, `description`, `image_url`, `created_by`, `privacy` |
| `group_members` | `group_id`, `user_id`, `role` |
| `group_requests` | `group_id`, `user_id`, `status` |
| `group_messages` | `group_id`, `user_id`, `content`, `image_url`, `video_url`, `audio_url` |

`supabase-setup.sql` creates the `profiles` table and signup trigger, enables Row Level Security, and installs policies for the tables listed above. The setup section replaces existing policies on these app-owned tables, so back up and review custom policies before running it. Run the script only after all listed application tables exist; the policy definitions use the documented columns. Storage writes are restricted to each user's own object paths. Because the `posts` bucket is public and the app stores public URLs for all media, uploaded message attachments are also publicly retrievable by URL; do not use this storage design for confidential media.

---

## Security deployment checklist

- Use HTTPS in production; the app sends HSTS and other browser security headers in production. Protected pages check the browser session, while Supabase RLS and authenticated API handlers enforce access to data and actions. Middleware refreshes sessions when Supabase verification succeeds and lets page-level checks handle temporary verification failures.
- Keep email confirmation enabled, configure exact production redirect URLs, and set the Supabase password minimum to 6 characters plus leaked-password protection where available. The UI also enforces a 6-character minimum; provider-side enforcement is required for API clients that bypass the UI.
- Configure Supabase Auth rate limits and CAPTCHA for sign-up and password recovery, and use custom SMTP. The application does not implement MFA, per-user content privacy, account lockout, or a full report/block/moderation workflow.
- Treat the `posts` storage bucket as public. RLS protects writes but cannot make objects in a public bucket private.
- Keep the Supabase service-role key and Daily/VAPID private keys in server-only deployment secrets. Rotate any secret that was previously published or exposed.
- Call and push endpoints use database-backed per-user rate limits; only the service role can consume rate-limit buckets.
- Run the app's RLS setup in a staging project first and verify public posts, private group membership, direct messages, story expiry, notifications, and account deletion behavior against your actual table definitions.

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
3. Add the environment variables from `.env.local` before deploying. Keep `DAILY_API_KEY`, `VAPID_PRIVATE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` server-only.
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
- Video trimming runs in the browser with FFmpeg WebAssembly; its core is downloaded from unpkg the first time a user trims a video.
- Delete account removes the user's data and signs them out. Removing the auth user itself needs a server-side admin call.
- The setup SQL installs least-privilege app policies; apply it to a staging project first and check it against the deployed schema.
- Calls use only the server-only `DAILY_API_KEY` environment variable. Never expose it with the `NEXT_PUBLIC_` prefix.

---

## Roadmap

- [x] Real video trimming
- [x] Push notifications
- [x] Restyled auth pages and popups to match the new design
- [ ] Android APK build

---

## Author

Built by [@nafeelahd](https://github.com/nafeelahd).
