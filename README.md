# SocialApp — Next.js + Supabase

A social media app built feature by feature.

## What's built so far
- User sign up (email + password + username)
- Email confirmation flow
- User login
- Protected routes (middleware)
- Auto-redirect logged-in users away from auth pages
- Feed page (placeholder, ready for posts)

## Project structure
```
app/
  auth/
    login/page.tsx       ← Login page
    signup/page.tsx      ← Sign up page
    callback/route.ts    ← Email confirmation handler
  feed/page.tsx          ← Protected feed (after login)
  layout.tsx
  page.tsx               ← Redirects to /auth/login
lib/
  supabase/
    client.ts            ← Browser Supabase client
    server.ts            ← Server Supabase client
middleware.ts            ← Auth route protection
supabase-setup.sql       ← Run this in Supabase SQL editor
```

## Setup (5 steps)

### 1. Create a Supabase project
Go to https://supabase.com → New project → note your URL and anon key

### 2. Run the SQL setup
Supabase dashboard → SQL Editor → paste contents of `supabase-setup.sql` → Run

### 3. Enable email auth
Supabase dashboard → Authentication → Providers → Email → make sure it's enabled

### 4. Add environment variables
```bash
cp .env.local.example .env.local
```
Then fill in your Supabase URL and anon key from the Supabase dashboard → Settings → API

### 5. Install and run
```bash
npm install
npm run dev
```

Open http://localhost:3000

## Next features to build
- [ ] User profiles page
- [ ] Create post
- [ ] Feed with posts
- [ ] Like & comment
- [ ] Follow / unfollow
- [ ] Notifications
- [ ] Direct messages
