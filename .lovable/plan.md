

## Plan: Redesign Sales Trend Chart on Dashboard

### Overview
Replace the static hardcoded chart in `src/pages/Index.tsx` with a fully interactive, data-driven sales trend chart. The chart dynamically switches between hourly (Today) and daily (7/15/30 days) views, fetches real sales data from Supabase, supports horizontal scrolling, custom tooltips, and a click-to-detail modal.

### Changes

**1. Create `src/components/SalesTrendChart.tsx` — New Component**

- **Props**: `pharmacyId`, `timeRange` (from existing state)
- **Data fetching**: Query `sales` table filtered by pharmacy and date range. For "today", group by 2-hour slots (8AM, 10AM, 12PM, 2PM, 4PM, 6PM, 8PM, 10PM, 12AM). For multi-day ranges, group by date.
- **Dynamic title**: "Today's Hourly Sales Trend" vs "Last 7 Days Sales Trend" etc.
- **Chart**: Recharts `AreaChart` with blue gradient fill, smooth monotone curve, `CartesianGrid` (horizontal only), hidden Y-axis.
- **Scroll container**: Wrap chart in a `div` with `overflow-x-auto` and a fixed inner width (wider than container) so it scrolls horizontally. Style the scrollbar with a custom CSS class — amber/yellow track using Tailwind + inline styles for webkit scrollbar.
- **Tooltip (hover)**: Custom Recharts `<Tooltip content={...} />` component showing time/date + exact sales amount in a styled card.
- **Click interaction**: `onClick` handler on chart data points. When clicked, set state to open a modal/dialog showing:
  - The specific hour or date
  - Total sales amount
  - Number of invoices
  - Data fetched on-demand from `sales` + `sale_items` tables
- **Modal**: Use existing `Dialog` component from `src/components/ui/dialog.tsx`. Styled with rounded corners and clean layout.
- **Container styling**: `rounded-3xl shadow-sm bg-white p-4`

**2. Update `src/pages/Index.tsx`**

- Remove the static `salesData` array and inline chart JSX (lines 24-40, 174-209)
- Import and render `<SalesTrendChart pharmacyId={profile?.pharmacy_id} timeRange={timeRange} />`
- The existing `timeRange` state and `Select` dropdown already exist and will drive the chart

### Technical Details

- **Hourly grouping (Today)**: Fetch all completed sales for today, group client-side into 2-hour buckets by `created_at` hour
- **Daily grouping (7/15/30 days)**: Group by date string `format(date, "MMM d")`
- **Scroll width calculation**: For "today" mode, 9 data points at ~60px each = ~540px min-width. For 30 days, 30 points at ~50px = ~1500px min-width.
- **Custom scrollbar CSS**: Add a utility class in `src/index.css` for styled webkit scrollbar (amber/yellow thumb, transparent track)
- **Click modal data**: On point click, query `sales` filtered to that specific hour/date to get invoice count and total

### Files Changed
1. `src/components/SalesTrendChart.tsx` — NEW
2. `src/pages/Index.tsx` — replace inline chart with component
3. `src/index.css` — add custom scrollbar utility class

