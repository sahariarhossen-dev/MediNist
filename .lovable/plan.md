# Mobile landing header polish

Scope: `src/pages/Landing.tsx` → `LandingHeader` only. No logic, no other files.

## Changes

1. **Glassmorphism**
   - Header already `fixed`; strengthen the glass: `bg-white/70` + `backdrop-blur-md` + `backdrop-saturate-150`.
   - Replace plain `border-b border-slate-100` with both a hairline `border-b border-slate-100/80` and a soft `shadow-[0_1px_2px_rgba(15,23,42,0.04)]` for gentle separation from the hero.

2. **Logo breathing room**
   - Bump container horizontal padding on mobile from `px-5` to `pl-6 pr-4 sm:px-8` so the wordmark sits further from the edge while keeping the right cluster snug.

3. **Mobile Login button (left of hamburger)**
   - Add a compact, text-only/outlined `Link to="/login"` visible only on mobile (`md:hidden`):
     - Style: `h-9 px-3 rounded-full text-sm font-medium text-slate-700 border border-slate-200 hover:text-brand hover:border-brand/40 transition`.
   - Wrap it together with the existing hamburger in a `flex items-center gap-2 md:hidden` cluster so spacing is consistent.

4. **Hamburger button**
   - Keep behavior; just restyle to match (rounded-full, border-slate-200, subtle hover) so the Login + menu pair looks intentional.

5. **Mobile menu sheet**
   - No structural change. (Optional: hide the duplicate "Sign in" inside the open sheet since it's now in the top bar — confirm during build.)

## Out of scope
Desktop header, hero, other sections, routing, auth.
