# MB2 Webinar Catalog — Supabase migration

This folder is a drop-in upgrade for the existing `mb2-webinar-catalog` Vite + React app
deployed on Netlify. It replaces the Google Sheets / JSONP data source with Supabase,
and adds an `/admin` panel for managing events.

The public catalog (the iframe that loads inside your Thought Industries pages) looks
and behaves the same — same URL, same `?exclusive=1` toggle for the MB2 Exclusive page,
same filter sidebar. Only the data source changed.

> **A behavior change you asked for:** on the MB2 Exclusive page (`?exclusive=1`), the
> "Show only MB2 Exclusive" checkbox is now hidden, so visitors can't uncheck it.
> The filter stays locked on under the hood. See `src/App.jsx` around the comment
> "The exclusive toggle is HIDDEN in exclusive mode".

---

## What's in here

```
mb2-catalog-changes/
├── package.json                 # adds @supabase/supabase-js, react-router-dom, papaparse
├── netlify.toml                 # SPA redirect so /admin/* deep links work
├── .env.example                 # which env vars Netlify needs
├── supabase/
│   └── schema.sql               # paste into Supabase SQL editor — creates tables + RLS + storage
└── src/
    ├── main.jsx                 # adds <BrowserRouter> with / and /admin routes
    ├── App.jsx                  # the catalog — now fetches from Supabase
    ├── lib/
    │   ├── supabase.js          # Supabase client
    │   └── normalize-csv.js     # turns a CSV row into a Supabase insert
    └── admin/
        ├── AdminApp.jsx         # auth-gated admin shell
        ├── Login.jsx            # magic-link sign in
        ├── EventsList.jsx       # table with publish toggle / edit / delete
        ├── EventForm.jsx        # create / edit + image upload
        ├── ImportCsv.jsx        # bulk import from a Sheet CSV export
        └── admin.css
```

You will **drop these files into your existing repo**, overwriting `src/App.jsx`,
`src/main.jsx`, and `package.json`. Keep `index.html`, `vite.config.js`, and
`src/App.css` as-is — the public catalog UI hasn't changed visually.

---

## Setup, end to end (~25 minutes)

### 1. Create a Supabase project

1. Go to <https://supabase.com>, sign up, click **New project**.
2. Name it something like `mb2-events`. Pick a strong DB password (save it in 1Password —
   you won't need it for the app, only for emergencies).
3. Choose a region close to your team. Wait ~2 minutes for it to provision.

### 2. Run the schema

1. In Supabase, open **SQL Editor → New query**.
2. Paste the entire contents of `supabase/schema.sql` and click **Run**.
   You should see "Success" — no rows returned. This creates:
   - `public.events` table with every column the app uses
   - `public.admins` table that controls who can write
   - Row-level security policies (public can read **published** events, admins can do everything)
   - `event-images` storage bucket for thumbnails and vendor logos

### 3. Grab your Supabase keys

1. In Supabase, click **Project settings → API**.
2. Copy:
   - **Project URL** → this is your `VITE_SUPABASE_URL`
   - **Project API keys → anon public** → this is your `VITE_SUPABASE_ANON_KEY`

> The **anon key** is safe to expose in the browser — RLS policies protect the data.
> Never paste the **service_role** key anywhere in this app.

### 4. Drop the changes into your repo

From your local clone of `mb2-webinar-catalog`:

```bash
# Copy the new and updated files in
cp -R path/to/mb2-catalog-changes/src/*    ./src/
cp    path/to/mb2-catalog-changes/package.json    ./
cp    path/to/mb2-catalog-changes/netlify.toml    ./
cp -R path/to/mb2-catalog-changes/supabase        ./
cp    path/to/mb2-catalog-changes/.env.example    ./

npm install
```

Create a local `.env.local` with your keys (for `npm run dev`):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Quick sanity check:

```bash
npm run dev
```

Open <http://localhost:5173>. The catalog will be empty until you do step 6. The
`/admin` route should show the magic-link login screen.

### 5. Configure Netlify

1. In Netlify → your site → **Site settings → Environment variables**, add:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
2. Optional: you can delete the old `VITE_DATA_URL` variable. The new app doesn't read it.
3. Trigger a deploy (push to `main`, or **Deploys → Trigger deploy → Deploy site**).

### 6. Make yourself the first admin

1. Open `https://your-netlify-site/admin` and sign in with your email (you'll get a magic link).
2. After clicking the link, you'll see "You're signed in, but not an admin yet".
3. In Supabase → **Authentication → Users**, find yourself and copy the user ID.
4. In Supabase → **SQL Editor**, run:

   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'you@dentlogics.com';
   ```

5. Refresh `/admin`. You're in.

### 7. Bring over your existing events

1. In your Google Sheet, **File → Download → Comma Separated Values (.csv)**.
2. In the admin panel, click **Import CSV**, drop the file, review the preview.
3. Click **Import as drafts**. Everything imports with `is_published = false`.
4. Open each event you want live and flip the **Published** toggle in the events list.
5. Once you're happy, the Google Sheet is retired. You can stop updating it.

### 8. Invite the rest of your team

For each teammate:

1. Have them visit `/admin` and sign in with their dentlogics email (magic link).
2. After they sign in, run in Supabase SQL Editor:

   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'teammate@dentlogics.com';
   ```

(A v2 of this app could add a "team management" page so you don't have to run SQL —
shout if you want that next.)

---

## How the publish toggle and MB2 flag work together

| Page                                 | What it shows                                   |
|--------------------------------------|-------------------------------------------------|
| `/`                                  | All published events (drafts are hidden)        |
| `/?exclusive=1`                      | Only published events where MB2 Exclusive = on  |
| `/admin`                             | Every event — published and drafts              |

The "Show only MB2 Exclusive" filter checkbox is **hidden on the exclusive page**, so
no one can untick it.

---

## Local dev cheat sheet

```bash
npm install
npm run dev          # http://localhost:5173 — public catalog + /admin
npm run build        # production build into dist/
npm run preview      # serve dist/ locally to sanity-check
```

---

## If something breaks

- **Catalog is empty after deploy** — almost always one of:
  - You forgot to set env vars in Netlify, or didn't redeploy after setting them.
  - No events have `is_published = true` yet (drafts don't show up).
- **"You're signed in, but not an admin yet"** — you haven't run the `insert into admins`
  SQL for your user yet. See step 6.
- **Image upload fails with a policy error** — re-run `supabase/schema.sql`. The storage
  bucket policies live in there and may not have applied the first time.
- **"new row violates row-level security policy"** when saving an event — you're signed in
  but not in the `admins` table. Same fix as above.
