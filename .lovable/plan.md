## Publish Bangla blog post #2 — "৬০,০০০+ ওষুধের রেডি ডাটাবেজ"

Append a new post to the existing blog system using the established Content Manager workflow. No schema or routing changes.

### Steps

1. **Generate cover image** — `src/assets/blog/cover-database-bn.jpg` via imagegen (1280×720, premium quality for text legibility).
   - Prompt: 16:9 premium illustration, a glowing cloud streaming dozens of Bangladeshi medicine brand names (Napa, Seclo, Ace, Sergel, Monas) as floating pill-shaped chips into a clean smartphone showing the MediNist app, badge "60,000+ Ready Drugs", modern blue-green palette, soft gradients, professional SaaS aesthetic.

2. **Append BlogPost object** to `src/data/blogPosts.ts`:
   - `id`: `"8"`
   - `slug`: `"60000-drug-database-bn"`
   - `title`: provided Bangla title
   - `summary`: provided Bangla summary
   - `language`: `"bn"`
   - `publishDate`: `"2026-05-20"` (today)
   - `readTime`: `"৬ মিনিট পড়া"`
   - `author`: `{ name: "MediNist টিম", role: "Product" }`
   - `imageUrl`: imported new cover
   - `imageAlt`: Bangla alt — "MediNist অ্যাপে ৬০,০০০+ ওষুধের রেডি ডাটাবেজ স্ট্রিম হচ্ছে"
   - `tag`: `"ডাটাবেজ ও সেটআপ"`
   - `content`: provided HTML, cleaned (normalize a few stray non-Bangla glyphs like "বৈพลิবকা" → "বিপ্লবী", "অল্টারনে티브" → "অল্টারনেটিভ"; preserve all `<h2>/<p>/<ul>/<li>/<strong>` exactly otherwise).

3. **Verify** — confirm post renders at `/blog/60000-drug-database-bn`, appears as newest in `/blog` hub and on the landing page's latest-posts strip.

### Files

- **Create**: `src/assets/blog/cover-database-bn.jpg`
- **Edit**: `src/data/blogPosts.ts` (add import + append one object)

No other files change. No new dependencies.
