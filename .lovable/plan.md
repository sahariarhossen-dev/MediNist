## Goal

Teach the AI to switch between two answer modes — **(A) General Knowledge Mode** (pre-trained pharmacy/medical/app knowledge, no DB required) and **(B) Database-Driven Mode** (strict use of injected `<scope>` + `LIVE PHARMACY DATA`) — without weakening the RBAC rules we just hardened.

All changes are confined to `supabase/functions/ai-chat/index.ts` (system prompt assembly). No changes to `contextBuilder.ts`, `shared.ts`, or tests.

---

## Changes

### 1. Rewrite `SYSTEM_BASE` (line 11)

Replace the current single-paragraph base with a dual-mode declaration:

- Declare the AI has **two knowledge sources**: (1) its own pre-trained knowledge about MediNist features, general pharmacy operations, and medical concepts; (2) the injected `<scope>` + `LIVE PHARMACY DATA` block.
- Tell it to classify each user turn:
  - **Generic / conceptual / app-feature / general medical** → answer directly from pre-trained knowledge, conversational tone, Bangla if user wrote Bangla/Banglish.
  - **Specific shop data** (inventory, sales numbers, dues, expenses, staff, etc.) → use ONLY the injected context, obeying every `<scope>` and security rule.
- Explicitly state: "If LIVE PHARMACY DATA is marked unavailable, you may still answer general questions normally — do not refuse."

### 2. Add Rule 24 inside `buildSecurityBlock` (after rule 23, line 553)

```
24. DUAL-MODE ANSWERING:
    (a) GENERAL / CONCEPTUAL queries (how MediNist works, what a generic
        drug class does, general pharmacy workflow advice, greetings, app
        help) → answer from your own knowledge in a friendly conversational
        tone. No database lookup required. Do NOT say "data not found" for
        these.
    (b) SHOP-SPECIFIC queries (this shop's inventory, sales, dues,
        expenses, staff, customers, today's numbers, etc.) → answer
        STRICTLY from the LIVE PHARMACY DATA block. All RBAC rules
        (1–23) still apply with full force.
    (c) MEDICINE-BY-NAME queries are still governed by rule 21 (MedEx
        blocks). Rule 24 does NOT relax rule 21.
    (d) If LIVE PHARMACY DATA shows "unavailable" (fallback message),
        still answer general / conceptual / medical questions normally.
        Only refuse to give exact shop numbers, and explain briefly that
        live data could not be loaded right now.
```

### 3. Soften rule 4 wording (line 488–490)

Keep the "never invent numbers" rule, but scope the "no sales records" exact-reply requirement to **shop-specific sales questions** only, so a generic question like "tumi ki MediNist e kaj koro?" no longer collides with rule 4.

Change rule 4 second sentence to:
> "If the user asks for shop-specific sales numbers but NO sales records exist…"

### 4. Verification

After edit, run `supabase--test_edge_functions` against `ai-chat` to confirm the existing RBAC unit tests still pass (the prompt text isn't covered by tests, so they should remain green — this is just a safety check).

---

## Out of scope

- No changes to `buildPharmacyContext`, `assertNoForbiddenFields`, MedEx pipeline, output post-filter, or UI badge.
- No new tools, no streaming changes, no DeepSeek model swap.
- `fallbackContextMessage` already returns a soft "unavailable" string; we're just teaching the prompt to handle it gracefully.

## Deliverables

- Edited `supabase/functions/ai-chat/index.ts` (SYSTEM_BASE + rule 4 + new rule 24).
- Confirmation that `ai-chat` Deno tests still pass.