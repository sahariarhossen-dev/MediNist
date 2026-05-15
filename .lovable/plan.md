# Pricing Section Redesign

Refactor the `Pricing` component in `src/pages/Landing.tsx` (lines ~412–520) from 3 static tiers to **2 cards with a Monthly/Yearly toggle**.

## Changes

### 1. Replace `tiers` array with structured plan data
Two plans: `trial` (always ৳0) and `regular` (dynamic pricing).

### 2. Convert `Pricing` to a stateful component
- `useState<"monthly" | "yearly">("monthly")` for billing cycle.
- Toggle UI at top center: pill-style segmented control with **Monthly** / **Yearly** labels using existing brand tokens. Next to "Yearly" a small badge: **"Save 17% (2 Months Free)"** (brand-soft bg, brand text, rounded-full).

### 3. Card 1 — Free Trial (left, outlined)
- Title: **Free Trial**
- Price: **৳0** (static, no period change)
- Subheading: *"নতুন রেজিস্টার করলেই প্রথম মাস একদম ফ্রি!"*
- Features: Full feature access · 99% BD medicine database · Inventory & Sales tracking · AI Assistant
- CTA: **Start 1-Month Free Trial** → `/register`, outlined style (border-slate-200, hover brand)

### 4. Card 2 — Regular Subscription (right, recommended)
- Title: **Regular Subscription**
- Recommended badge top-center (brand pill, like current "Most Popular")
- Pricing:
  - Monthly: **৳2,000** `/ month`
  - Yearly: **৳20,000** `/ year` with strikethrough **৳24,000** shown beside it
- Subheading: *"আপনার ফার্মেসীর জন্য পরিপূর্ণ সলিউশন।"*
- Features: Unlimited products · Full medicine database access · Advanced staff management · Priority AI support · Business insights
- CTA: **Get Started with Pro** → `/register`, solid brand button

### 5. Layout & styling
- Grid: `lg:grid-cols-2` with `max-w-4xl mx-auto` so two cards feel balanced.
- Keep existing card chrome: `rounded-3xl`, soft shadow, `ring-1 ring-slate-100`, hover lift.
- Regular card: `ring-2 ring-brand` + the existing brand glow shadow.
- Use `cn()` and brand tokens (`bg-brand`, `text-brand`, `bg-brand-soft`) — no hardcoded colors.
- Smooth price transition: wrap price in a span with `transition-all` (simple opacity/translate is enough; no extra deps).

### 6. Out of scope
- No changes to nav, hero, JSON-LD, or other sections.
- No backend/business logic changes.

## Technical notes
- Component currently const-arrow; convert to a function component to use `useState`. Already imports `useState` is not present — add to existing `react` import at top of file.
- Remove the now-unused `tiers` array.
- All Bengali text rendered as-is in JSX string literals (file is UTF-8).
