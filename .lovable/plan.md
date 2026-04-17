
## Plan: Premium MediNist logo + brand integration

### Goal
Replace plain "Medinist" text with a custom SVG logo (stylized medical cross fused with letter "M") across the app, plus update the favicon for consistent branding.

### Logo design spec
- **Icon**: Medical cross where the lower vertical stroke morphs into a stylized "M". Rounded corners, geometric, digital feel. Sized roughly 32×32 in header.
- **Wordmark**: "MediNist" in bold sans-serif (Inter — already loaded by Tailwind defaults), sitting to the right of the icon.
- **Colors**:
  - Primary: `#C0392B` (deep red) for icon body + wordmark
  - Accent: `#E74C3C` (lighter red) as a linear gradient highlight on the "M" transition
- **Two variants**:
  1. `LogoFull` — icon + "MediNist" wordmark (header, chat header)
  2. `LogoMark` — icon-only square (favicon, app launcher, future avatars)

### Files to create
1. **`src/components/brand/LogoFull.tsx`** — full logo SVG (icon + wordmark), accepts `className` and `height` props.
2. **`src/components/brand/LogoMark.tsx`** — icon-only SVG, square viewBox, accepts `className` and `size`.
3. **`public/favicon.svg`** — standalone SVG favicon (same artwork as `LogoMark`) so browsers render it crisp at any size.
4. **`public/logo-mark.svg`** — same icon-only artwork, used as Apple touch icon / app launcher.

### Files to modify
1. **`src/pages/Index.tsx`** (Dashboard header)
   - Replace the `<span>Medinist</span>` (line ~106) with `<LogoFull height={28} />`.
   - Keep alignment with bell + avatar on the right.

2. **`src/components/ai/ChatHeader.tsx`** (AI Assistant header)
   - Replace the white `Sparkles`-in-circle block (lines ~37–39) with `<LogoMark size={36} className="rounded-full bg-white/15 p-1.5" />`.
   - Keep "MediNist AI" title text — the title still reads as the AI sub-brand.

3. **`index.html`**
   - Remove default `/favicon.ico` reference (currently implicit).
   - Add `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.
   - Add `<link rel="apple-touch-icon" href="/logo-mark.svg" />`.
   - (Optional) update `<title>` to "MediNist".

### What stays the same
- Login/Register pages already use text branding — out of scope unless requested.
- Tailwind config: no theme color changes; logo carries its own brand red so it pops against the existing blue UI without clashing (red is reserved as the brand mark only).
- BottomNav, other pages: no "Medinist" text references found there.

### Technical notes
- SVG logos are inlined as React components (no asset fetch, instant render, themeable via props).
- The "M" gradient uses an SVG `<linearGradient>` with a unique `id` per component instance to avoid collisions.
- `LogoMark` uses a square `viewBox="0 0 64 64"` so it scales cleanly at favicon sizes (16, 32, 180px).
- No existing `public/favicon.ico` deletion needed — the SVG `<link>` takes precedence in modern browsers; we'll keep the `.ico` as a fallback but the SVG will win.

### Out of scope
- No redesign of the header layout, bell, or avatar.
- No PWA manifest changes (can add later if you want true installable app icon).
- No changes to the auth pages' branding.
