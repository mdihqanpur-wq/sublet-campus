# Student sign-in

Students register or sign in with a code sent to an approved university email. A saved email address in localStorage does not grant access. Each protected page checks the Supabase user and the account record before showing its content.

## Setup

The frontend still runs with the existing Python HTTP server. Supabase JS 2.117.3 is included in `vendor/`, with its license. `auth-config.js` contains the public project URL and publishable key. Gmail SMTP credentials belong only in Supabase settings.

`001_student_accounts.sql` is the foundation already applied to this project. Do not run it again. On a new database, apply it first.

1. Install the files on `abdul/student-auth` and run the checks.
2. In Supabase SQL Editor, run the complete `002_student_signin.sql` file, from `begin;` to `commit;`. If the dashboard offers to rewrite it to enable RLS, choose **Run without RLS**. This migration creates a function, not a table, and leaves existing table RLS enabled.
3. Open Authentication → Auth Hooks. Add or edit **Before User Created**, choose a Postgres function, and select schema `public`, function `student_signup_check`. Save and enable it. Creating the SQL function alone does not activate the hook. Do not replace any other hook type.
4. In Authentication → Emails → Templates, use `{{ .Token }}` in both **Magic Link** and **Confirm signup**. Keep email confirmation enabled. The form expects the default six-digit email code. If you previously changed the code length, set it back to six for this form.
5. Test the Codespaces preview with your own university inbox. A saved SMTP configuration is not evidence that an email was delivered. Do not share passwords, session tokens or verification codes.

## Deployment order

The live frontend and backend may deploy separately. Coordinate the merge with Mehr and wait for both Render services to finish deploying this branch's changes.

Then run the complete `003_protect_housing.sql` in Supabase SQL Editor. This removes anonymous reads from the existing listing table and adds an active-student policy. It preserves listing records and the old profile table. Do not apply it while the old frontend is still deployed, because that frontend requests housing anonymously.

Until this last migration is applied and the new backend is deployed, the old public listing access is still present. A frontend redirect by itself is not database protection.

After the cutover, `/api` remains public as a health check. `/api/listings` requires an Authorization bearer token. The frontend reads listings through the signed-in Supabase client, under the same database policies. The backend creates a separate client for each request and verifies the user's token and account access.

## What is stored where

- My Account: first name, last name, display name, major, year and introduction are saved in `student_profiles`.
- Optional phone and alternative email: saved separately in `student_contacts`. They are private, unverified, and are not recovery methods.
- Housing Profile: the existing preference form still saves in the browser. It has not been converted into shared roommate discovery.
- Shortlists and housing profiles use a separate browser key for each authenticated account. Old shared browser records are left untouched and are not assigned to a new user automatically.
- Location drafts still stay in the browser. The map configuration and key restrictions are unchanged.

Photo uploads, listing submission, shared roommate results and the moderation interface are separate work. Supabase organization roles do not automatically give someone an application admin role. New student accounts receive the `student` role from the database.

## Checks

```bash
node --test frontend-checks.cjs map-checks.cjs auth-checks.cjs
npm ci --prefix backend --ignore-scripts
node --test backend/auth-checks.cjs
git diff --check
```

Manual checks to record in TESTING.md after actually trying them:

- A personal email is rejected before the website sends a code.
- After the hook is enabled, a direct Supabase signup with a personal email is also rejected.
- A university signup receives an email, accepts the current code and opens My Account.
- An incorrect code does not open housing.
- Sign in does not create an account silently. New students use Create account.
- Saved account details survive a refresh and are available on another signed-in browser.
- Two different users cannot read or update each other's private account details.
- Signing out hides the current page and blocks a direct visit to discovery.html, match.html and account.html.
- The map, filters and account-specific shortlist still work after sign-in.
- After migration 003 and deployment, the unauthenticated backend listings route returns 401 and a direct anonymous database listing read is denied.
- A suspended account cannot fetch listings or update its profile with an existing token.

Do not mark email delivery, production deployment or live RLS tests as passed until they have been checked against the hosted project.
