## Goal

Adopt the new MediNist AI spec for medicine queries: deliver a comprehensive 6-section pharmacological report FIRST, then ask the user for consent before checking shop inventory. All work is in the system prompt of `supabase/functions/ai-chat/index.ts` — no schema, code, or frontend changes.

## Changes to `supabase/functions/ai-chat/index.ts`

### 1. Rewrite rule 21 — new 6-section "Knowledge First" medical format

Replace the current 4-section block with:

1. **Medicine & Generic Name** — Brand + Generic, clearly displayed.
2. **Indications (কেন খাওয়া হয়)** — purpose in simple Bn/En.
3. **Dosage & Administration (মাত্রা)** — standard adult guideline + mandatory `ব্যবহারের আগে ডাক্তারের পরামর্শ নিন।`
4. **Efficacy Timing (কখন খেলে ভালো কাজ করে)** — before/after meals, morning/night, empty stomach, etc.
5. **Pricing & Popular Alternatives** — estimated BD market price + 2–3 popular SAME-GENERIC brand alternatives (knowledge-based, not inventory-based).
6. **Warnings & Contraindications** — who must avoid, key side effects.

End with the exact CTA line (translated to user's language):
- BN: `এই ওষুধটি আপনার দোকানের stock-এ আছে কিনা চেক করব?`
- EN: `Would you like me to check if this medicine is available in our shop's inventory?`

And the mandatory footer on every medical reply:
- BN: `নোট: যেকোনো ওষুধ সেবনের আগে অবশ্যই রেজিস্টার্ড ডাক্তারের পরামর্শ নিন।`
- EN: `Note: Always consult a registered physician before taking any medication.`

The 6-section block is the PRIMARY response for any "what does X do / X er kaj ki / kno khai / dose / kibhabe khabo" intent. Inventory status is NOT included in the initial reply — it is gated behind user consent (see rule 22).

### 2. Rewrite rule 22 — Inventory becomes consent-gated

Change the inventory cross-check rule:

- On the FIRST medical query about a medicine: do NOT mention inventory in the body. Only the CTA question above.
- On the NEXT user turn, if the user agrees ("hae", "ji", "yes", "check koro", "dekhao", "ha please", etc.):
  - (a) Found, healthy stock → "✅ আপনার দোকানে **<n> <unit>** stock আছে — দাম ৳<price>।"
  - (b) Found, low/zero → flag + up to 2 SAME-GENERIC alternatives from inventory; otherwise `একই জেনেরিকের কোনো বিকল্প এখন stock-এ নেই।`
  - (c) Not in inventory → `দুঃখিত, এই ওষুধটি আমাদের ইনভেন্টরিতে নেই।` + same-generic alternatives only.
- If the user says no / changes topic, skip inventory.
- ANTI-PATTERN preserved: never cross-generic substitute (Acemox ≠ Amilin).

### 3. Tighten rule 21 zero-hallucination clause

Keep the existing brand→generic verified mappings (Napa, Seclo, Acemox=Acetazolamide, Amilin=Amitriptyline, etc.). When NOT 100% certain, output EXACTLY:

`I could not find verified data for this specific medicine. Please check the spelling or refer to the physical packaging.` (or Bangla equivalent)

…and SKIP sections 2–6 entirely. Still show the doctor footer + offer the inventory CTA so the shop can still help.

Explicitly forbid claims like "I searched MedEx" / "I queried the internet" — all medical info comes from internal pharmacological knowledge.

### 4. Mobile-friendly formatting clause

Add to rule 12 / rule 21: every medical reply MUST use **bold** section headers, bullet points under Dosage / Warnings, and short 1–2 line paragraphs (mobile-first).

### 5. Keep existing rules intact

Rules 1–20, 23 (no "data not saved", date-specific lookup, role policies, security, follow-up question, comparisons, etc.) remain unchanged. The mandatory follow-up from rule 14 is REPLACED by the inventory CTA for medical queries (so we don't double-ask).

### 6. No code-layer / DB / frontend changes

- Inventory block already in context, only consumed on consent turn.
- No new tools, no MedEx API call (rule 21 explicitly forbids claiming external lookups — keeps latency + cost flat and matches user's previous "internal knowledge only" preference).
- No changes to `ChatMessage.tsx`, `AIAssistant.tsx`, or DB.

## Verification scenarios

- "Napa er kaj ki?" → 6-section report (Paracetamol, fever/pain, 500mg 6-hourly + disclaimer, after meals, ৳1.20 + Ace/Fast/Reset, avoid in liver disease), CTA "stock check korbo?", footer. NO inventory in first reply.
- User replies "ha" → inventory branch runs and reports stock/price OR same-generic alternatives.
- "Acemox kno khai?" → correctly Acetazolamide (glaucoma/altitude), NOT Amoxicillin. CTA + footer.
- "Xyzbrand er kaj ki?" (unknown) → exact "could not find verified data" disclaimer, sections 2–6 skipped, footer + inventory CTA still offered.
- "27-4 er sale koto?" → unchanged: per-day lookup or `ঐ তারিখে কোনো সেল রেকর্ড করা হয়নি`.

## Out of scope

- External MedEx scraping / web search.
- Schema additions (no `generic_name` column).
- UI changes.
