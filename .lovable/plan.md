## MediNist marketing landing page

Build a public marketing landing page at `/` that matches the dashboard's visual identity, move the authenticated dashboard to `/dashboard`, and auto-redirect logged-in visitors there.

### 1. Routing changes (`src/App.tsx`)

- Add new public route `/` → `<Landing />` (no auth wrapper).
- Move dashboard from `/` to `/dashboard` (ProtectedRoute + AppLayout + Index).
- Update `ProtectedRoute` redirect target from `/login` to `/login` (unchanged) but `PublicRoute` redirect from `/` → `/dashboard`.
- Add a `LandingRoute` wrapper: if `user` is logged in → `<Navigate to="/dashboard" replace />`; else render landing.

### 2. Internal link updates (replace `/` with `/dashboard`)

Files touched: `BottomNav.tsx`, `Login.tsx`, `Register.tsx`, `ResetPassword.tsx`, `AcceptInvitation.tsx`, `Messages.tsx`, `ShortItems.tsx`, `Profile.tsx`, `useRootBackHandler.ts` (update ROOT_PATHS to include `/dashboard` instead of `/`), `useNotifications.ts` (link target), `NotFound.tsx` (home link → `/dashboard` for app users; landing remains separate).

### 3. PWA manifest (`public/manifest.json`)

- Change `start_url` from `/` to `/dashboard` so installed PWA opens directly into the app.
- Keep `scope: "/"`.

### 4. Landing page (`src/pages/Landing.tsx` + section components)

Single route component composed of section components in `src/components/landing/`:

- `LandingHeader.tsx` — fixed top nav, white/blur bg, MediNist wordmark (reuse `LogoFull`), nav links (Home, Features, Pricing, Blog, Contact), primary blue "Get Started" → `/register`. Mobile: hamburger sheet.
- `Hero.tsx` — center-aligned. H1 "The Modern AI Solution for Your Pharmacy Management". Subheading mentioning MediScrape + inventory. Primary CTA "Try for Free" → `/register`, secondary "Watch Demo". Visual: stylized dashboard mockup card (recreate the screenshot's insight cards in pure JSX so it stays crisp at any size, includes ৳ values).
- `Features.tsx` — 4 cards in a grid mirroring dashboard insight cards (rounded-2xl, soft shadow, blue-tinted icon chip): Smart Inventory + MediScrape, Real-time Sales Insights, AI Drug Lookup Assistant, Mobile-First Experience.
- `Stats.tsx` — small social-proof strip (pharmacies, ৳ tracked, drugs in catalog).
- `Pricing.tsx` — 3 tiers (Free, Basic, Premium) styled like insight cards; middle tier highlighted with primary blue ring + "Popular" badge; ৳ pricing.
- `Blog.tsx` — section with 3–4 static placeholder articles as cards (title, excerpt, read-time). Posts data inline; "Read more" links go to anchor sections (no real post pages — keeps scope tight).
- `FAQ.tsx` — short FAQ accordion (reuse shadcn accordion).
- `CTASection.tsx` — final blue gradient band with "Start Free Today".
- `Footer.tsx` — logo, link columns (Product / Company / Legal), copyright, ৳ note.

### 5. Branding tokens (`src/index.css`)

Add design tokens so landing matches the app:
- `--brand: 222 89% 53%` (the `#2463eb` from `LogoFull`) and `--brand-foreground: 0 0% 100%`.
- `--brand-soft: 222 89% 96%` for icon chip backgrounds.
- `--accent-warning: 32 95% 56%` for "Short Items"-style orange accents.
- Register matching Tailwind colors in `tailwind.config.ts` (`brand`, `brand-soft`, `accent-warning`) so utility classes work.
- Use Inter via Google Fonts `<link>` in `index.html` to match the app's clean sans-serif.

### 6. SEO (`src/main.tsx` + `index.html` + Landing)

- Install `react-helmet-async`, wrap app in `HelmetProvider` in `src/main.tsx`.
- Remove `<link rel="canonical">` from `index.html` (each route owns its own).
- Update `index.html` `<title>`/description to landing-focused copy; add Organization JSON-LD.
- `Landing.tsx` adds `<Helmet>` with title, description, canonical `https://medinist.com/`, og tags, and SoftwareApplication JSON-LD.

### 7. Verification

- Logged-out visit to `/` → see landing page; refresh works (vercel.json SPA fallback already in place).
- Logged-in visit to `/` → instant redirect to `/dashboard`.
- `/dashboard` and all existing app routes still work; bottom nav highlights Dashboard correctly.
- Install as PWA → opens at `/dashboard`.
- Visual QA at 390px (mobile) and 1280px (desktop): cards match dashboard radius/shadow, brand blue matches `#2463eb`, ৳ rendered correctly.

### Out of scope

- No Next.js migration (project is Vite + React Router).
- No real CMS-backed blog (placeholders only).
- No middleware (Vite has none); auth-gated redirect is client-side via React Router.
- No edge function / Supabase changes.