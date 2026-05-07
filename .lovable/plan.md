## Goal

Tighten `supabase/functions/ai-chat/index.ts` so MediNist AI:
1. Treats medical-info questions as the PRIMARY intent (medical answer first, inventory second).
2. Refuses to guess a medicine's generic name — uses a verified safety disclaimer when unsure.
3. Only suggests alternatives that share the EXACT same generic.
4. Keeps the strict per-day lookup for sales/expenses (no "data not saved").

All work is in the system prompt of the edge function. No DB schema changes.

## Changes to `supabase/functions/ai-chat/index.ts`

### 1. Rewrite rule 21 — 4-Point Medical Format (intent-first, anti-hallucination)

Replace the current rule 21 with a stricter version:

- **Intent priority**: If the user asks "what does X do / X er kaj ki / X kno khai / X kibhabe khabo / X er dose", the medical 4-point block is the PRIMARY response. Do NOT lead with "out of stock" — Inventory Status is the LAST of the 4 points.
- **Generic verification (anti-hallucination)**:
  - Before naming the generic, the model must internally verify the brand→generic mapping.
  - Explicit examples baked into the prompt so the model does not confuse them: "Acemox = Acetazolamide (NOT Amoxicillin)", "Amilin = Amitriptyline (NOT Amoxicillin)", "Napa = Paracetamol", "Seclo = Omeprazole", "Monas = Montelukast", "Maxpro = Esomeprazole".
  - If the model is NOT 100% sure of the brand's generic, it MUST output exactly:
    `এই ওষুধটির জেনেরিক নাম ডাটাবেসে নিশ্চিত হওয়া যাচ্ছে না। সঠিক তথ্যের জন্য ওষুধের প্যাকেট দেখুন বা ডাক্তারের পরামর্শ নিন।`
    and skip the Indication/Dosage sections (still show Inventory Status + follow-up).
- **Fixed structure** (kept from current rule, ordering unchanged):
  1. **Indication (কী কাজ করে)**
  2. **Dosage (মাত্রা)** + mandatory disclaimer `ব্যবহারের আগে ডাক্তারের পরামর্শ নিন।`
  3. **Market Price (আনুমানিক দাম)**
  4. **Inventory Status** (last, not first)
- End with one short follow-up question.

### 2. Tighten rule 22 — Same-generic-only alternatives

Update the inventory cross-check so alternatives are ONLY suggested when they share the EXACT same generic name as the requested medicine. Add explicit anti-pattern: "Do NOT suggest Amilin as a substitute for Acemox — different generics."

Branches become:
- (a) Found, healthy stock → show stock + price.
- (b) Found, low/zero stock → flag + suggest up to 2 alternatives that share the SAME generic (only if confidently known); otherwise say "একই জেনেরিকের কোনো বিকল্প এখন stock-এ নেই।"
- (c) Not in inventory → "দুঃখিত, এই ওষুধটি আমাদের ইনভেন্টরিতে নেই।" + same-generic alternatives only.

### 3. Reinforce rule 18/19 wording for date queries

Small tightening: explicitly forbid the phrase "ডাটা সেভ নেই" / "data is not saved" anywhere; the only acceptable "no entry" phrasing is `ঐ তারিখে কোনো লেনদেন রেকর্ড করা হয়নি` (or the সেল/খরচ variant already in rule 18). The per-day Daily-sales and Daily-expense blocks already exist in the data context, so no data-layer change needed.

### 4. No code-layer changes

- Daily sales block (last 120 days) ✅ already built.
- Daily expense totals block (last 90 days) ✅ already built.
- Inventory block with company/stock/price ✅ already built.
- Date filtering already happens in-prompt against per-day buckets — DB query is by ISO date prefix, which is exact.

## Out of scope

- No external Medex / web scraping (would add latency + API cost; user previously approved "internal knowledge only").
- No schema additions (no generic_name column on `medicines` — model relies on internal pharmacology knowledge + the verified-or-disclaimer rule).
- No frontend change.

## Verification scenarios

- "Acemox er kaj ki?" → 4-point block: Indication = Glaucoma/altitude sickness (Acetazolamide), dosage + disclaimer, est. price, Inventory Status last. NOT confused with Amoxicillin. NOT suggesting Amilin as alternative.
- "Amilin kno khai?" → 4-point block as Amitriptyline (depression/neuropathic pain), NOT Amoxicillin.
- Obscure brand the model isn't sure about → outputs the exact "জেনেরিক নাম ডাটাবেসে নিশ্চিত হওয়া যাচ্ছে না" disclaimer, still shows Inventory Status, follow-up.
- "Napa nai?" → Indication first (Paracetamol — fever/pain), then Inventory Status with same-generic alternative (e.g. Ace, Fast) only if same generic confirmed.
- "27-4 er sale koto?" with no entry → `ঐ তারিখে কোনো লেনদেন রেকর্ড করা হয়নি` + follow-up. Never "data not saved".