
# Brand MediNist auth emails (incl. Reset Password)

## Approach

Instead of pasting raw HTML into the Supabase dashboard (which doesn't apply cleanly in Lovable Cloud), we'll scaffold Lovable's managed React Email templates, brand them for MediNist, and deploy. The **Reset Password** template is one of six that get scaffolded — we'll style all of them consistently so your auth emails look unified.

## Prerequisite: Email domain

Lovable's email system requires a verified sender subdomain (e.g. `notify.medinist.app`). The project currently has none configured. You'll be shown a setup dialog to add one — DNS verification can finish in the background; we don't need to wait to scaffold/style.

## Brand spec (extracted from project)

- **Primary blue**: `#2463eb` (from `LogoFull.tsx`)
- **App name**: MediNist
- **Body bg**: `#ffffff` (required)
- **Button radius**: `8px` (from `--radius: 0.5rem`)
- **Heading color**: `#0a1729` (foreground)
- **Body text**: `#55687a` (muted-foreground)
- **Font**: System sans (`-apple-system, Segoe UI, Roboto, Arial, sans-serif`)
- **Footer**: `© 2026 MediNist` + "If you didn't request this, please ignore this email."

## Steps

1. **Add email domain** — open the email setup dialog, enter your sending subdomain, complete DNS info.
2. **Scaffold templates** — creates `auth-email-hook` Edge Function + 6 React Email templates (signup, magic-link, **recovery**, invite, email-change, reauthentication) in `supabase/functions/_shared/email-templates/`.
3. **Brand the templates** — apply MediNist palette/typography, mobile-responsive layout, MediNist wordmark header (text logo, matches app), CTA button using `{{ .ConfirmationURL }}` equivalent, and the requested footer copy.
4. **Deploy** the `auth-email-hook` edge function.
5. **Confirm** — once DNS verifies (tracked in Cloud → Emails), Supabase routes auth emails through your branded templates automatically.

## Recovery (Reset Password) template — content blueprint

```text
Header:    [MediNist wordmark, blue]
Heading:   Reset your password
Body:      Hi there, we received a request to reset the password
           for your MediNist account. Click the button below to
           choose a new one. This link expires in 1 hour.
CTA:       [ Reset Password ]   → ConfirmationURL
Fallback:  Or copy this link: <url>
Footer:    If you didn't request this, please ignore this email.
           © 2026 MediNist
```

## Files that will be created/edited

- `supabase/functions/auth-email-hook/index.ts` (new)
- `supabase/functions/auth-email-hook/deno.json` (new)
- `supabase/functions/_shared/email-templates/recovery.tsx` (new, branded)
- `supabase/functions/_shared/email-templates/signup.tsx` (new, branded)
- `supabase/functions/_shared/email-templates/magic-link.tsx` (new, branded)
- `supabase/functions/_shared/email-templates/invite.tsx` (new, branded)
- `supabase/functions/_shared/email-templates/email-change.tsx` (new, branded)
- `supabase/functions/_shared/email-templates/reauthentication.tsx` (new, branded)
- `supabase/config.toml` (updated)

## What you'll see after approval

- Email setup dialog (one-time, to add your sending subdomain)
- Branded templates committed to your repo
- Edge function deployed
- Link to preview the Reset Password email in Cloud → Emails

## If you truly want raw dashboard HTML instead

If you'd rather paste HTML directly into Supabase's auth template editor (bypassing Lovable's pipeline — works but isn't recommended for this project), say so and I'll generate the standalone HTML file instead. Note: it won't use a custom sender domain, will be overridden if Lovable Emails is later enabled, and won't be version-controlled with your code.
