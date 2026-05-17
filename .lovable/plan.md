# Privacy Policy Page — Implementation Plan

## 1. New page: `src/pages/Privacy.tsx`

A standalone, mobile-first privacy page using existing tokens (brand, slate). No new deps.

### Structure (top to bottom)

1. **Sticky header** — `sticky top-0 z-40 backdrop-blur bg-white/70 border-b border-slate-100`
   - Left: "MediNist" wordmark (text-brand, font-extrabold).
   - Right: `<Link to="/">` styled button "← Back to Home" with arrow translate-x on hover.

2. **Hero** — `px-4 py-6 md:px-12 md:py-16`
   - H1 "Privacy Policy" (`text-3xl md:text-5xl font-extrabold text-slate-900`).
   - Subtext "Last Updated: May 2026" (`text-sm text-slate-500`).

3. **Summary grid** — `grid grid-cols-1 md:grid-cols-3 gap-6 mt-8`
   - 3 cards: `rounded-2xl border border-slate-100 shadow-sm bg-white p-6` with line-art lucide icons (`ShieldCheck`, `Lock`, `Sparkles`) in a soft brand-tinted square. Title + description exactly as specified.
   - Hover: `hover:shadow-md hover:-translate-y-0.5 transition`.

4. **Body split**
   - Desktop (md+): `grid md:grid-cols-4 gap-10`
     - Col 1: **Sticky TOC sidebar** `md:sticky md:top-24 self-start`. List of 7 numbered links scrolling to section IDs (`#sec-1`…`#sec-7`). Active section highlighted via `IntersectionObserver` (brand left-border + text-brand).
     - Cols 2-4 (`md:col-span-3`): scrolling content with `space-y-10`.
   - Mobile (<md): TOC becomes a horizontal capsule chip scroller above content — `flex gap-2 overflow-x-auto no-scrollbar sticky top-14 bg-white/80 backdrop-blur py-3 -mx-4 px-4 border-b border-slate-100`. Chips: `rounded-full border border-slate-200 px-4 py-1.5 text-xs whitespace-nowrap`. Smooth scroll on click via `scrollIntoView({behavior:'smooth', block:'start'})`.

5. **Seven legal sections** (IDs `sec-1`…`sec-7`)
   - Each: `<section id="sec-N" className="scroll-mt-28">` with `<h2 className="text-xl font-bold mb-4 text-slate-800">` and prose body (`text-slate-600 leading-relaxed space-y-3`).
   - Exact copy from the user's brief, rendered verbatim. Sub-points (A/B and bullets) rendered as `<ul className="list-disc pl-5 space-y-2">` where present.

6. **Footer** — reuse the same `Footer` from `Landing.tsx`.
   - Refactor: export the existing `Footer` (and `scrollToHash`) from `Landing.tsx`, or extract `Footer` to `src/components/landing/LandingFooter.tsx` and import from both. Plan: **extract to `src/components/landing/LandingFooter.tsx`** and update `Landing.tsx` to import it. Cleaner and avoids cyclical imports.
   - In the extracted footer, change the Privacy `<a href="#">` to `<Link to="/privacy">Privacy</Link>` from `react-router-dom`.

## 2. Router wiring (`src/App.tsx`)

- Import `Privacy from "./pages/Privacy"`.
- Add `<Route path="/privacy" element={<Privacy />} />` as a public route (outside auth gates so logged-out and logged-in users can both view it; do not wrap in `PublicRoute` since that redirects authed users).

## 3. Footer Privacy link

After extraction, the Privacy `<li>` uses `<Link to="/privacy">` so clicking from the landing page navigates to the new page. SPA scroll-to-top: Privacy page's top-level `useEffect` calls `window.scrollTo(0,0)` on mount.

## 4. Design polish

- TOC active state via `IntersectionObserver` on section IDs (rootMargin `-30% 0px -60% 0px`).
- All transitions `transition-all duration-200`.
- Cards icons in `h-10 w-10 rounded-xl bg-brand/10 text-brand` square.
- Use semantic tokens (`text-brand`, `bg-brand`, `border-slate-*`). No raw color hex.
- Respect viewport: hero scales fluidly, summary grid stacks on mobile, body single-column on mobile.

## Technical notes

- Files created: `src/pages/Privacy.tsx`, `src/components/landing/LandingFooter.tsx`.
- Files edited: `src/App.tsx` (route), `src/pages/Landing.tsx` (import & use extracted footer).
- No backend, no new packages. Uses existing `lucide-react`, `react-router-dom`, Tailwind tokens.
