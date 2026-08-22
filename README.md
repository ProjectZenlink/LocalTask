# LocalTask

Freelancer account-opening task marketplace. Three roles — freelancer, Account Manager (AM), admin — on one Vite + React + Supabase stack.

## Stack
- **Frontend** Vite 5 · React 18 · TypeScript · Tailwind CSS · react-router v7
- **Backend** Supabase (Postgres + RLS, Realtime, Storage, Edge Functions)
- **Design** "Dispatch" — warm paper `#F2EFE8`, deep petrol `#244B4D`; Space Grotesk / Inter / Space Mono

## Layout
```
src/pages       freelancer-facing (EN only)
src/am          AM console        (zh/en)
src/admin       admin console     (zh/en, superset)
src/components  shared UI · chat · wizards
supabase/functions  edge functions (deployed via dashboard)
localtask_v1_rebuild.sql  master schema — full resets ONLY, never run on production
```

## Deploy
1. Migrations: run the numbered `mXX.sql` in the Supabase SQL Editor (idempotent).
2. Frontend: replace `src/` in Bolt; run `npm install` when `package.json` changed.
3. Never enable auto-fix suggestions on RLS/security warnings — several policies are intentionally permissive by design.
