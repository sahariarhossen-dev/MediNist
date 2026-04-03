

## Sales Page — Premium UI Build

### Overview
Replace the placeholder Sales page with a premium, eye-catching design featuring glassmorphism, sparkline chart, and styled sales history list. All using the existing Recharts library and Tailwind CSS.

### Single File Change: `src/pages/Sales.tsx`

**1. Hero Section — Glassmorphism "Create New Sale" Card**
- Full-width card with `backdrop-blur-xl`, semi-transparent white/emerald gradient background, `rounded-3xl`, soft shadow
- Large glowing green `+` icon (Plus from lucide-react) with a pulsing ring animation
- Bold "CREATE NEW SALE" text, emerald green accent
- Clickable — for now just a toast placeholder

**2. Analytics Card — "Today's Total Sale"**
- Grey/white card with `rounded-2xl`, soft shadow
- Title "Today's Total Sale" in cool grey
- Large emerald green amount text (e.g., ৳12,546)
- Right side: small Recharts `LineChart` sparkline (hardcoded sample data for today's trend) with emerald green stroke and gradient fill
- Small `↑ 12% vs yesterday` badge in green

**3. Sales History List**
- Section title "Sales History" with a "View All" link
- Striped list using `even:bg-emerald-50/50`
- Each row: receipt icon (Receipt from lucide-react), bold Invoice ID, time, and amount in emerald green
- All items use `rounded-2xl` containers
- Hardcoded mock data (5-6 entries) since there's no sales table yet

**4. Styling Details**
- White background (`bg-white` / `bg-gray-50`)
- Emerald green palette: `emerald-500`, `emerald-600` for accents
- Cool grey: `gray-400`, `gray-500`, `gray-600` for secondary text
- `rounded-2xl` / `rounded-3xl` on all cards
- Soft shadows: `shadow-lg`, `shadow-xl`
- Glass effect: `bg-white/60 backdrop-blur-xl border border-white/20`
- Sparkline via Recharts `LineChart` + `Line` (no axes, no grid, tiny)

### No new dependencies or DB changes needed.

