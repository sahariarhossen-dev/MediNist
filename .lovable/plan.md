

## Plan: Restore Blue branding and integrate clean "M" logo

### What's actually wrong
The app's design tokens (`index.css`) and Tailwind utilities are still blue — only the new logo SVGs introduced red. Nothing else needs "reverting" color-wise; the blue UI is intact (BottomNav active state, AI gradient header, primary buttons, summary cards all use `blue-*` classes already).

### Changes

**1. Redesign `LogoMark.tsx`** — drop the medical cross, use a clean ribbon-style "M" matching the reference image, recolored brand blue.
- New artwork: a single stylized "M" path (two outer legs + center V), 64×64 viewBox.
- Default colors: primary `#2563EB` (blue-600), accent `#3B82F6` (blue-500) for a subtle gradient on the right leg — gives the "premium SaaS" depth without losing the flat, modern feel.
- Same `size` / `className` / `primary` / `accent` props — drop-in compatible.

**2. Update `LogoFull.tsx`** — wordmark color from `#C0392B` → `#1E3A8A` (blue-900) for a deep, corporate "MediNist" look that pairs with the blue-600 mark. Keep the same Inter bold + tight letter-spacing.

**3. Replace `public/favicon.svg`** — same new blue "M" artwork as `LogoMark`, standalone SVG. Browsers will render it crisp at 16/32/180px.

**4. Replace `public/logo-mark.svg`** — same blue "M" artwork at 180×180 for Apple touch icon.

**5. `src/pages/Index.tsx` (Dashboard header)** — no structural change. `<LogoFull height={28} />` is already in place; it'll automatically pick up the new blue colors. Already vertically centered with the bell + avatar via `flex items-center`.

**6. `src/components/ai/ChatHeader.tsx` (AI Chat)** — already uses `<LogoMark size={28} />` inside a white circle. With the blue recolor, the "M" will now read as the brand mark on the indigo-blue gradient header. No structural change needed.

**7. `src/components/ai/ChatMessage.tsx` (AI assistant avatar)** — currently shows a `Sparkles` icon in a blue gradient circle next to AI messages. Replace with `<LogoMark size={18} primary="#FFFFFF" accent="#FFFFFF" />` so the "M" appears in white on the blue gradient bubble — unifies the avatar with the brand mark across the chat.

### What stays the same
- All theme tokens in `index.css` (already blue/neutral).
- All `bg-blue-*`, `from-blue-600`, `to-indigo-600` utility classes app-wide.
- BottomNav active states, buttons, cards, charts.
- `index.html` favicon links (file paths unchanged, only contents updated).
- Login/Register branding (out of scope as before).

### Logo artwork (ribbon "M")
Single closed path forming the silhouette of an "M":
```
outer legs slightly wider at the base, inner V dipping ~60% down,
rounded outer corners, sharp inner notch — matches the reference.
```
Geometry sketch (64×64):
```
(8,56)─(8,12)─(20,12)─(32,40)─(44,12)─(56,12)─(56,56)
       ─(46,56)─(46,30)─(34,52)─(30,52)─(18,30)─(18,56)─close
```

### Out of scope
- No theme token rewrites (already blue).
- No PWA manifest.
- No auth-page branding.
- No teal accent additions (existing palette is blue + indigo + neutral; adding teal would be a new design decision — flag if you want it).

