# Subscription Management Page

Add a new route `/subscription` rendered inside `AppLayout`, plus a "Subscription" entry on the More page. All data is mocked for now and structured to map cleanly onto a future Supabase `subscriptions` + `subscription_payments` schema.

## Files

**New**
- `src/pages/Subscription.tsx` — page shell, sections, mock data
- `src/components/subscription/StatusCard.tsx` — hero card with countdown + progress
- `src/components/subscription/CountdownTimer.tsx` — live ticking timer with subtle number animation
- `src/components/subscription/ExtendPlans.tsx` — three plan cards (1m / 3m popular / 6m)
- `src/components/subscription/PaymentHistory.tsx` — transactions list
- `src/hooks/useCountdown.ts` — `useEffect` based 1s tick returning `{days, hours, minutes, seconds, totalMs}`
- `src/lib/subscriptionMock.ts` — mock expiry, plans, transactions, helper `stackExpiry(currentExpiry, days)`

**Edited**
- `src/App.tsx` — register `/subscription` route (ProtectedRoute + AppLayout)
- `src/pages/More.tsx` — add menu item "Subscription" (icon `CreditCard`) routing to `/subscription`

## Sections

### 1. Status Card (Hero)
- Badge: green dot + "Active"
- Big countdown: `21d : 12h : 25m : 30s` — each unit in its own pill; on value change apply `animate-fade-in` + `key={value}` so React remounts and re-animates the digit
- Background tint via remaining days:
  - `>= 7d` → emerald (`bg-emerald-50`, accent `text-emerald-700`, border `border-emerald-200`)
  - `3–7d` → amber
  - `< 3d` → rose
- Progress bar (`@/components/ui/progress`) = `remainingMs / totalPlanMs * 100`
- Subtext: "Renews on {formatted expiry}" + plan name

### 2. Extend Plans
- Three cards in a responsive grid: `grid-cols-1 sm:grid-cols-3`
- Each card: duration title, price (e.g., ৳499 / ৳1,299 / ৳2,399), bullet features, "Pay Now" button
- Middle card has "Popular" ribbon and primary border
- Click "Pay Now" → calls `stackExpiry(currentExpiry, days)` and shows a toast "New expiry: {date}" (mock; ready to swap for a Supabase insert + RPC)

### 3. Payment History
- Card with header "Payment History"
- Mobile: stacked rows (date + amount on top line, duration + status badge below)
- ≥ sm: `@/components/ui/table` with columns Date | Amount | Duration Added | Status
- Status pill: success = emerald, pending = amber

## Technical Details

```ts
// useCountdown.ts
export function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target.getTime() - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff / 3_600_000) % 24);
  const minutes = Math.floor((diff / 60_000) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds, diff };
}
```

```ts
// stackExpiry — extend from later of (now, currentExpiry)
export function stackExpiry(current: Date, addDays: number) {
  const base = current.getTime() > Date.now() ? current : new Date();
  return new Date(base.getTime() + addDays * 86_400_000);
}
```

Mock shape (ready for Supabase mapping):
```ts
type Subscription = { plan: string; started_at: string; expiry_date: string; total_days: number };
type Payment = { id: string; date: string; amount_bdt: number; duration_days: number; status: "success" | "pending" };
```

## Styling
- Page wrapper: `min-h-screen bg-[#F4F6FB] max-w-md md:max-w-2xl mx-auto pb-24 px-page`
- Cards: `bg-white rounded-2xl shadow-sm p-4`
- Icons: `CreditCard`, `Clock`, `Zap`, `CheckCircle2`, `Receipt` from lucide-react
- All sizes use existing fluid tokens (`text-fluid-sm`, etc.) and Tailwind responsive classes for 100% mobile-first behavior

## Out of Scope
- Real payment gateway integration
- Supabase tables / RLS — schema noted via mock types so it can be added in a follow-up
