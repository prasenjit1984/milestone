# Setting up Google Drive Picker + Voyage AI credentials

This is a one-time setup so the PDF import feature (Parent Mode → Content tab)
can actually talk to Google Drive and Voyage AI instead of showing "not
configured yet." Takes about 15 minutes. You'll end up with three values to
paste into `.env.local` and into Vercel's project settings.

```
NEXT_PUBLIC_GOOGLE_API_KEY=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
VOYAGE_API_KEY=
```

---

## Part 1 — Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   sign in with the Google account you want to own this (any account works —
   it doesn't need to be the same one your Drive PDFs live in, since Drive
   access is granted per-user via the picker itself).
2. Top left, click the project dropdown → **New Project**.
3. Name it something like `milestone-app` (name doesn't matter). Click
   **Create**. Wait a few seconds for it to finish, then make sure it's
   selected in the project dropdown.

## Part 2 — Enable the two APIs

1. Left sidebar (or hamburger menu) → **APIs & Services** → **Library**.
2. Search for **Google Picker API** → click it → **Enable**.
3. Search for **Google Drive API** → click it → **Enable**.

## Part 3 — OAuth consent screen

1. Go to **APIs & Services** → **OAuth consent screen** (this may also be
   labeled **Google Auth platform** → **Overview**/**Branding** depending on
   which console version you land in — same thing).
2. If prompted for **User Type**, choose **External** (unless you have a
   Google Workspace org and want to restrict this to it — External is right
   for a personal Google account).
3. Fill in the required fields:
   - **App name**: `Milestone`
   - **User support email**: your email
   - **Developer contact email**: your email
4. You do *not* need to add scopes manually here — the app requests
   `drive.file` at runtime, which is a "non-sensitive" scope, so Google skips
   the app-verification review entirely. Skip past the scopes step if shown.
5. On the **Test users** step (if shown, because the app is in "Testing"
   publishing status): add your own Google account's email address. Anyone
   not on this list won't be able to complete the picker's login step while
   the app is in Testing mode — which is fine for a single-family app, no
   need to publish it.
6. Save through to the end.

## Part 4 — OAuth 2.0 Client ID

1. Go to **APIs & Services** → **Credentials** (or **Google Auth platform** →
   **Clients**).
2. **Create Credentials** (or **Create Client**) → **OAuth client ID** →
   Application type: **Web application**.
3. Name: `Milestone web`.
4. Under **Authorized JavaScript origins**, add both of these (one per line —
   you need both so the picker works from your local dev server *and* the
   live site):
   - `http://localhost:3000`
   - `https://milestone-woad-beta.vercel.app`
5. Leave **Authorized redirect URIs** empty — the picker uses a token flow
   with no redirect.
6. Click **Create**. Copy the **Client ID** shown (looks like
   `123456789-abc...apps.googleusercontent.com`) — this is your
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. You won't need the client secret; Web
   application credentials for this flow don't use one.

## Part 5 — API key (for the Picker itself)

1. Still on **APIs & Services** → **Credentials**, click **Create
   Credentials** → **API key**. It generates immediately — copy it.
2. Click **Restrict key** (strongly recommended, takes 30 seconds):
   - **Application restrictions**: **Websites** → add
     `http://localhost:3000/*` and `https://milestone-woad-beta.vercel.app/*`.
   - **API restrictions**: **Restrict key** → check only **Google Picker
     API**.
   - Save.
3. This key is your `NEXT_PUBLIC_GOOGLE_API_KEY`. It's meant to be public
   (it ships to the browser) — the restrictions above are what actually keep
   it safe, not secrecy.

---

## Part 6 — Voyage AI API key

1. Go to [dashboard.voyageai.com](https://dashboard.voyageai.com) and sign
   up / sign in.
2. Find the **API keys** section of the dashboard and click **Create new
   secret key**.
3. Copy it immediately — this is your `VOYAGE_API_KEY`. Voyage's free tier
   (200M tokens/month as of when this doc was written) comfortably covers a
   home PDF library; check
   [voyageai.com/pricing](https://www.voyageai.com/pricing) if that's
   changed.

---

## Part 7 — Wire the three values in

**Locally**, in `milestone-web/.env.local` (create it from `.env.example` if
you haven't already):

```
NEXT_PUBLIC_GOOGLE_API_KEY=<the API key from Part 5>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<the Client ID from Part 4>
VOYAGE_API_KEY=<the key from Part 6>
```

Restart `pnpm dev` after saving so Next.js picks up the new env vars.

**In production**, add the same three in Vercel: Project → **Settings** →
**Environment Variables**, each scoped to Production (and Preview if you
want PDF import to work on preview deployments too). Redeploy after adding
them — Vercel only bakes in `NEXT_PUBLIC_*` vars at build time, so an env-var
change alone doesn't apply until the next deploy.

## Verifying it worked

Open Parent Mode → Content tab. The PDF import panel should now show a
**Choose PDF from Drive** button instead of the "not configured yet" card.
Click it, sign in with the Google account you added as a test user in Part
3, pick a PDF, and it should import (grade/subject/topic tagging, then
extraction → chunking → embedding). If Google shows an "app not verified"
warning during login, that's expected while the app is in Testing mode —
click **Advanced** → **Go to Milestone (unsafe)** to proceed; only test
users you added in Part 3 can get past this screen at all.
