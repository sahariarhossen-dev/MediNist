## Publish new Bangla blog post

Add post "MediNist কী? কেন এটি সাধারণ হিসাবের অ্যাপ নয়..." to the blog system using the existing content-manager workflow.

### Steps

1. **Generate cover image** — `src/assets/blog/cover-what-is-medinist-bn.jpg` via imagegen (16:9, premium quality for UI text legibility).
   - Prompt: pharmacist in white coat holding a premium tablet showing MediNist dashboard (clean charts, pill-shaped inventory buttons), blurred modern pharmacy rack background, blue + white MediNist palette, professional SaaS aesthetic.

2. **Append BlogPost object** to `src/data/blogPosts.ts`:
   - `id`: `"7"`
   - `slug`: `"what-is-medinist-pharmacy-management-bn"`
   - `title`: provided Bangla title
   - `summary`: provided Bangla summary
   - `language`: `"bn"`
   - `publishDate`: `"2026-05-19"` (today)
   - `readTime`: `"৭ মিনিট পড়া"` (calculated from ~7 sections of Bangla prose)
   - `author`: `{ name: "MediNist টিম", role: "Product" }`
   - `imageUrl`: imported cover
   - `imageAlt`: Bangla alt describing pharmacist with MediNist tablet dashboard
   - `tag`: `"MediNist পরিচিতি"`
   - `content`: provided HTML, cleaned (strip outer `[ ]` brackets, preserve `<h2>/<p>/<ul>/<li>/<strong>/<em>` exactly as supplied)

3. **Verify** — confirm post renders at `/blog/what-is-medinist-pharmacy-management-bn`, appears in `/blog` hub, and (as newest) on landing page latest-posts strip. No schema or routing changes needed.

### Files

- **Create**: `src/assets/blog/cover-what-is-medinist-bn.jpg`
- **Edit**: `src/data/blogPosts.ts` (add import + append one object)

No other files change. No new deps.
