# Student accounts

Students can create an account or sign in using a six-digit code sent to their university email. Personal email addresses are not accepted.

Housing and profile pages check the signed-in account before opening. The account must have a verified university email and active student access.

## Account details

Names, major, year of study and introductions are saved in Supabase. Optional phone numbers and alternative emails are stored separately and remain private. These contact details are not verified or used for account recovery.

Housing preferences, saved listings and map drafts still use browser storage. Housing profiles and shortlists are separated by account.

Shared roommate matching, photo uploads, listing submissions and moderation are still pending.

## Supabase configuration

The project URL and publishable key are in `auth-config.js`. SMTP credentials stay in Supabase.

- `001_student_accounts.sql` creates the account tables and access policies. It has already been applied to our database.
- `002_student_signin.sql` creates the university-email signup check. Enable `public.student_signup_check` under Authentication → Auth Hooks → Before User Created.
- Both the Magic Link and Confirm signup email templates use `{{ .Token }}`. Email OTP length must be set to 6, with email confirmation enabled.

## Deployment

After merging, wait for both Render services to finish deploying before running `003_protect_housing.sql`.

That migration restricts database listings to active, verified students. Running it before deployment would interrupt housing requests from the old frontend.

Until it is applied, anonymous database listing access remains open.

The `/api` health check stays public. `/api/listings` requires a valid bearer token and an active student account.

## Testing

Run:

    node --test frontend-checks.cjs map-checks.cjs auth-checks.cjs
    npm ci --prefix backend --ignore-scripts
    node --test backend/auth-checks.cjs
    git diff --check

Record manual results in `TESTING.md`, including email delivery, incorrect codes, sign-out, profile persistence, account privacy, housing filters and the map.

After deployment and migration 003, also check anonymous listing requests and suspended-account access. Keep anything not tested marked as pending.
