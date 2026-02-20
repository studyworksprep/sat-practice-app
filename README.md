# SAT Practice App (Next.js + Supabase + Vercel)

This is a lightweight SAT practice app scaffold built for **Next.js (App Router)** and **Supabase**.
It supports:
- Email/password auth (Supabase Auth)
- Question browsing with filters (difficulty, score band, domain, skill)
- Practice flow (render stimulus/stem/options; submit attempt)
- Per-user question status (done, marked for review, notes)
- Simple dashboard

## 1) Prerequisites
- Node.js 18+
- A Supabase project with tables roughly matching your schema:
  - `questions`, `question_versions`, `answer_options`, `correct_answers`, `attempts`, `question_status`, `question_taxonomy`
- Recommended: enable Row Level Security (RLS) and add policies so authenticated users can:
  - read questions/taxonomy/versions/options/correct answers (or restrict as you prefer)
  - insert into `attempts`
  - read/write their own `question_status`

## 2) Environment variables
Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## 3) Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

## 4) Deploy to Vercel
- Import the GitHub repo in Vercel
- Add the same env vars in Vercel Project Settings
- Deploy

## Notes on schema assumptions
This app expects:
- `question_versions.is_current = true` marks the active version
- `answer_options.ordinal` orders options
- `question_taxonomy` has filter fields (difficulty, score_band, domain_name/code, skill_name/code)

If your actual column names differ, adjust queries in:
- `app/api/questions/route.js`
- `app/api/attempts/route.js`
- `lib/db.js`

## Security note
This scaffold uses the Supabase **anon key** only. All data access should be protected by **RLS policies**.

