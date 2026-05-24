# Master Medicines Import System

## 1. Database migration

Add three nullable text columns to `public.master_medicines`:

- `format` (text)
- `pack_size` (text)
- `box_size` (text)

No data backfill, no RLS changes (existing read-only policies stay).

After the migration runs, `src/integrations/supabase/types.ts` regenerates automatically.

## 2. Hidden importer route

New page **`src/pages/AdminImportMaster.tsx`** mounted at `/admin/import-master` in `App.tsx`. Not linked from any menu.

Access guard inside the page:
- Requires authenticated user.
- Compares `user.id` against a hardcoded allowlist constant `SUPER_ADMIN_IDS` (we'll need your user ID — see Questions below). Anyone else gets a 404-style "Not found".

UI (mobile-first, semantic tokens, matches existing pages):

```text
┌────────────────────────────────────────┐
│  Master Data Importer (Hidden)         │
├────────────────────────────────────────┤
│  [ Choose medicines.json ]             │
│  Parsed: 5,234 rows · 1.8 MB           │
│                                        │
│  ⚠ This will TRUNCATE master_medicines │
│     and re-insert from scratch.        │
│                                        │
│  [ Clear & Sync Fresh Database ]       │
│                                        │
│  ▓▓▓▓▓▓▓▓░░░░░░░  1,200 / 5,234        │
│  Batch 6 / 27 · 200 rows each          │
│  Elapsed 00:18                         │
└────────────────────────────────────────┘
```

Flow:
1. File picker accepts `.json`, parses client-side, validates it's an array, shows row count.
2. Confirm dialog ("This will wipe existing master_medicines. Continue?").
3. Slice array into 200-row chunks. First chunk is sent with `truncate: true`; subsequent chunks with `truncate: false`.
4. Sequential `fetch` to the edge function per chunk; update progress bar after each success.
5. On final success → sonner toast `"Master database successfully synchronized!"` + final count.
6. On any chunk failure → stop, show error toast with batch index and server message, keep progress where it failed (user can retry the whole sync).

## 3. Edge function `import-master-medicines`

`supabase/functions/import-master-medicines/index.ts`, `verify_jwt = false` (default), uses service role to bypass the "no client writes" RLS on `master_medicines`.

Request body:
```json
{ "rows": [...up to 200 mapped rows...], "truncate": false }
```

Logic:
1. CORS preflight handled.
2. Validate caller JWT in code: read `Authorization: Bearer <token>`, call `supabase.auth.getUser(token)`, reject if the user ID isn't in the same `SUPER_ADMIN_IDS` allowlist (mirrored as an env constant or hardcoded — see Questions).
3. Zod-validate body: `rows` is an array (1–200), each row has `brand_name: string`.
4. If `truncate === true`: `DELETE FROM master_medicines` (via service-role client). Logged.
5. Map each row defensively:
   - `brand_name` → string (required)
   - `generic_name` → string | null
   - `strength` → string, default `"N/A"` if missing/empty/`"N/A"`
   - `unit_price` → `Number(parseFloat)`, NaN → `0`
   - `company` → string | null
   - `format`, `pack_size`, `box_size` → string | null
6. Bulk `insert()` the chunk. Return `{ inserted: N, truncated: boolean }`.
7. All responses (success + error) include CORS headers.

## 4. Client → function wiring

- Use `supabase.functions.invoke('import-master-medicines', { body: { rows, truncate } })` so the user's JWT is auto-attached for the in-function allowlist check.
- Sequential loop (not parallel) to keep ordering predictable and progress monotonically increasing.

## 5. Files touched

- New migration (add 3 columns)
- New: `src/pages/AdminImportMaster.tsx`
- New: `supabase/functions/import-master-medicines/index.ts`
- Edit: `src/App.tsx` (add `/admin/import-master` route, no nav link)

No changes to existing inventory/pharmacy code paths.

## Questions before I implement

1. **Your user ID** for the allowlist — please share the UUID from `auth.users` (your logged-in account). Without it I'd have to gate by email, which is less precise.
2. **Strength default** — confirm `"N/A"` (string) is what you want stored when missing, vs. `null`. Your spec says "N/A" so I'll go with that unless you say otherwise.
3. **Pre-existing rows** — confirm it's fine that the truncate is unconditional and irreversible (no soft-delete, no backup table).