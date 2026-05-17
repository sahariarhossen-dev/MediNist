# Terms & Conditions Page — Implementation Plan

Mirror the existing `/privacy` page architecture for full brand consistency, with new copy and icons.

## 1. New page: `src/pages/Terms.tsx`

Clone the structure of `src/pages/Privacy.tsx` (sticky blur header, hero, 3 summary cards, dual TOC, 7 sections, shared footer). Keep identical Tailwind tokens, spacing scale, transitions, and `IntersectionObserver`-driven active-section logic so the two legal pages feel like a matched pair.

### Structure (top to bottom)

1. **Sticky header** — `sticky top-0 z-40 backdrop-blur-md bg-white/70 border-b border-slate-100`
   - Left: "MediNist" wordmark (`text-brand font-extrabold`).
   - Right: `<Link to="/">` "← Back to Home" with arrow `translate-x` on hover (`group` + `group-hover:-translate-x-0.5`).

2. **Hero** — `px-4 py-6 md:px-12 md:py-16`
   - H1 "Terms & Conditions" (`text-3xl md:text-5xl font-extrabold text-slate-900`).
   - Subtext "Last Updated: May 2026" (`text-sm text-slate-500`).

3. **Summary grid** — `grid grid-cols-1 md:grid-cols-3 gap-6 mt-8`, cards `rounded-2xl border border-slate-100 shadow-sm bg-white p-6` with `hover:shadow-md hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-white hover:to-brand/5 transition-all duration-200`.
   - Card 1: `FileSignature` icon — "Subscription Licensing".
   - Card 2: `Cloud` icon — "100% Cloud Native".
   - Card 3: `Scale` icon — "Operational Liability".
   - Icons in `h-10 w-10 rounded-xl bg-brand/10 text-brand` square.

4. **Body split**
   - Desktop (md+): `grid md:grid-cols-4 gap-10`.
     - Col 1: sticky TOC sidebar `md:sticky md:top-24 self-start`. 7 numbered links to `#sec-1`…`#sec-7`. Active section highlighted via `IntersectionObserver` (brand left-border + `text-brand` + slight `translate-x-1` for micro-animation).
     - Cols 2–4 (`md:col-span-3`): scrolling content `space-y-10`.
   - Mobile (<md): TOC = horizontal capsule chip scroller, `sticky top-14 backdrop-blur bg-white/80 py-3 -mx-4 px-4 border-b border-slate-100 flex gap-2 overflow-x-auto no-scrollbar`. Chips: `rounded-full border border-slate-200 px-4 py-1.5 text-xs whitespace-nowrap`. Active chip gets `bg-brand text-white border-brand` with `transition-all`.

5. **Seven legal sections** (IDs `sec-1`…`sec-7`, `scroll-mt-28`)
   - Render the exact copy supplied in the brief verbatim. Sub-bullets become `<ul class="list-disc pl-5 space-y-2">`. Headings `text-xl font-bold mb-4 text-slate-800`; body `text-slate-600 leading-relaxed space-y-3`.

6. **Footer** — reuse existing `LandingFooter` from `src/components/landing/LandingFooter.tsx`.

### Polish details
- `html { scroll-behavior: smooth }` is already global; chip clicks also call `scrollIntoView({ behavior:'smooth', block:'start' })` and the active chip auto-scrolls into view horizontally.
- `window.scrollTo(0,0)` on mount.
- SEO via `react-helmet-async`: title "Terms & Conditions — MediNist", meta description from card 1 copy.

## 2. Router wiring (`src/App.tsx`)

- Import `Terms from "./pages/Terms"`.
- Add `<Route path="/terms" element={<Terms />} />` next to the existing `/privacy` route (public, no auth gate).

## 3. Footer link wiring (`src/components/landing/LandingFooter.tsx`)

- Change the existing Terms `<li>` from `<a href="#" onClick={preventDefault}>Terms</a>` to `<Link to="/terms" className="hover:text-brand">Terms</Link>`.

## Files

- **Created**: `src/pages/Terms.tsx`
- **Edited**: `src/App.tsx`, `src/components/landing/LandingFooter.tsx`

No new dependencies. Uses existing `lucide-react`, `react-router-dom`, `react-helmet-async`, and Tailwind brand/slate tokens.
