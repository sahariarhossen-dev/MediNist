## Goal

Remove all "MediScrape" branding from the Landing page and replace it with messaging centered on the master medicine database. Make the "99% of all medicines in Bangladesh" point highly prominent right next to the "Try for Free" button.

## Changes (all in `src/pages/Landing.tsx`)

### 1. Hero section (lines ~290–311)
- Rewrite description paragraph:
  > MediNist gives you instant access to a master database of **99% of all medicines available in Bangladesh** — combined with real-time sales insights and an AI drug-lookup assistant, all in one beautifully simple app.
- Add a prominent badge/pill directly above the CTA row, sitting right next to (or above) the "Try for Free" button:
  - Visual: rounded-full, brand-soft background, brand text, small database/check icon
  - Text: **"99% Medicine Data of Bangladesh — No manual entry"**
- Keep "Try for Free" and "Watch Demo" buttons unchanged.

### 2. Features list (line ~352)
- Rename feature: `"Smart Inventory + MediScrape"` → `"Master Medicine Database"`
- Update desc: "Access 99% of all medicines available in Bangladesh. Auto-fill product details instantly — set up your inventory in seconds, no manual entry needed."

### 3. Pricing tier feature (line ~424)
- `"MediScrape catalog"` → `"Full medicine database access"`

### 4. Blog post (line ~512–514)
- Title: `"Why Our Master Medicine Database Beats Manual Product Entry — Every Time"`
- Excerpt: "Adding products one-by-one is the silent killer of pharmacy productivity. Here's how instant access to 99% of Bangladesh's medicines saves 4+ hours per week."

### 5. FAQ (line ~591–592)
- Question: `"How does the medicine database work?"`
- Answer: "Search any drug name and MediNist auto-fills generic, strength, manufacturer, and price from our database covering 99% of medicines in Bangladesh — so you can stop typing the same fields all day."

### 6. SEO meta description (line ~729)
- Replace "smart inventory with MediScrape" with "instant access to 99% of Bangladesh's medicine database".

## Notes
- Pure English maintained (matches current design tone).
- Stats strip ("60K+ Drugs in catalog") left as-is — it already reinforces the database story.
- No structural/layout changes; only copy and one new prominent badge near the hero CTA.