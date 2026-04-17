
## Plan: Mobile UX optimization — auto-hide nav + keyboard handling

### Current state
- `BottomNav` is `fixed bottom-4` always visible (floating pill, 390px mobile).
- `AppLayout` wraps every page and renders `<BottomNav />` unconditionally.
- `AIAssistant.tsx` uses `fixed inset-0 flex flex-col pb-16` — the `pb-16` reserves space for the nav, and the input is inside a flex column (not sticky). When the mobile keyboard opens, iOS/Android shrink the visual viewport but the `fixed` container stays at full height, pushing the input below the keyboard.
- Dashboard (`Index.tsx`), `Sales.tsx`, `More.tsx` all add their own `pb-*` to avoid the nav.

### What to build

**1. Scroll-aware `BottomNav` (auto-hide)**
- Track `window.scrollY` + chat scroll container via a new hook `useScrollDirection()`.
- When scrolling down >10px → translate nav down & fade out.
- When scrolling up OR near top → translate up & show.
- Use `transition-transform duration-300 ease-out` + `translate-y-[120%]` to hide (fully off-screen so it doesn't block taps).
- Accept an optional `scrollContainerRef` prop so AI page can pass its own scroll element (since page scroll is locked).

**2. Keyboard-aware hiding using `visualViewport` API**
- New hook `useKeyboardOpen()`:
  - Listens to `window.visualViewport.resize`.
  - Returns `true` when `visualViewport.height` is significantly less than `window.innerHeight` (>150px diff = keyboard).
- When keyboard open → force-hide `BottomNav` regardless of scroll direction.
- This prevents the nav from sliding up with the keyboard.

**3. Fix AI chat input staying above keyboard**
- Change `AIAssistant.tsx` root from `fixed inset-0 ... pb-16` to `flex flex-col h-[100dvh]` (dynamic viewport height — respects keyboard on modern mobile).
- Remove `pb-16` (nav auto-hides when keyboard open, so no reserved space needed).
- Keep input as the last flex child with `shrink-0` — it naturally sits above the keyboard when `h-[100dvh]` is used.
- Add a safe-area bottom padding (`pb-[env(safe-area-inset-bottom)]`) for iPhone notch.

**4. Dashboard / other pages expand when nav hides**
- Replace fixed `pb-24` on Index/Sales/More with `pb-24` conditional — simpler: keep `pb-24` so content can scroll past; the auto-hide is purely visual so layout-reserved space is fine. Actually to truly expand, switch to `min-h-[100dvh]` on page wrappers — content fills full viewport and scrolls naturally.
- Keep the `pb-24` on scroll content so last items aren't covered when nav IS visible.

### Files
- **NEW** `src/hooks/useScrollDirection.ts` — returns `'up' | 'down' | 'idle'`, accepts optional element ref.
- **NEW** `src/hooks/useKeyboardOpen.ts` — returns boolean via `visualViewport`.
- **EDIT** `src/components/BottomNav.tsx` — apply hide/show transform based on both hooks; accept optional scroll ref.
- **EDIT** `src/components/AppLayout.tsx` — no structural change (still wraps children + nav).
- **EDIT** `src/pages/AIAssistant.tsx` — switch to `h-[100dvh]`, remove `pb-16`, add safe-area, pass scroll ref to nav via context or prop drilling. Simplest: expose a `scrollElementId` the nav hook can `getElementById` on mount, OR let AI page call a small context. **Decision: use a lightweight `ScrollContainerContext`** so AI page registers its messages scroll div, and `BottomNav` subscribes. Dashboard uses window scroll (default).
- **NEW** `src/contexts/ScrollContainerContext.tsx` — optional ref registry.

### Technical notes
- `100dvh` (dynamic viewport height) is the modern fix for mobile keyboard + URL bar. Supported in all current mobile browsers.
- `visualViewport` API is the reliable cross-browser keyboard detector (iOS Safari + Android Chrome).
- Transform-based hide (`translate-y-[120%]`) is GPU-accelerated; `opacity` fade adds polish.
- Threshold: ignore scroll deltas <5px to avoid jitter.

### Out of scope
- No changes to auth, routing, or AI edge function.
- No redesign of the nav pill itself — only its visibility behaviour.
