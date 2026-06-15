# Format-aware parsing for spider-catalog-sync

Refactor Step C (pack parsing) and Step D (math validation) in `supabase/functions/spider-catalog-sync/index.ts` so non-tablet products are saved in their native units instead of being rejected as `math_mismatch`.

## 1. Detect product format

Add a helper `detectFormat(brand_title, pack_text)` returning one of:
- `strip` — Tablet, Capsule, Suppository (default)
- `liquid` — Syrup, Suspension, Drops, Solution, Spray, Inhaler, Mouthwash (volume in `ml`)
- `semisolid` — Cream, Ointment, Gel, Lotion, Paste, Oil (weight in `g`/`gm`)
- `single` — Injection, Infusion, Vial, Ampoule, IV, IM, PFS, or any `1's pack`

Detection sources (in order):
1. Form word inside the `<h1><small>...</small></h1>` brand title.
2. Keywords in raw `pack_text` (`ml`, `bottle`, `gm`/`g tube`, `tube`, `vial`, `ampoule`, `1's pack`).

## 2. Update `parseBrandPage`

Extend `BrandPage` with:
- `format: 'strip' | 'liquid' | 'semisolid' | 'single'`
- `container_text: string | null` (e.g. `"60 ml bottle"`, `"15 gm tube"`, `"1 vial"`)
- `container_qty: number | null` and `container_unit: 'ml' | 'g' | 'vial' | 'ampoule' | 'pcs' | null`

Parsing additions inside the `package-container` scope:
- Regex for `(\d+(?:\.\d+)?)\s*(ml|gm|g)\b` → liquid/semisolid quantity + unit.
- Regex for `(\d+)\s*(vial|ampoule|bottle|tube)s?` → single-unit container.
- Fallback: if `pack_text` matches `\d+\s*'s\s*pack` and format ≠ strip → treat as single (qty=number, unit=`pcs`).
- Keep existing N×M and `Ns pack` regex only when format = `strip`.

## 3. Rewrite Step C/D in `processOne` + main loop

Replace the current unconditional math cross-check with branch by `page.format`:

```text
if format == 'strip':
    run existing unit*pcs == strip and strip*spp == pack checks
else:
    skip math entirely
    require container_text to be present (else unmatched_no_candidate)
```

## 4. Database write policy

In the matched branch of the main loop, build `after` based on format:

- **strip** (unchanged):
  - `pcs_per_strip = p.pcs_per_strip`
  - `strip_per_pack = p.strip_per_pack`
  - `pack_size = "${strip_per_pack} x ${pcs_per_strip}"`
  - `unit_price = p.unit_price`

- **liquid / semisolid / single**:
  - `pcs_per_strip = 1`
  - `strip_per_pack = 1`
  - `pack_size = p.container_text` (e.g. `"60 ml bottle"`, `"15 gm tube"`, `"1 vial"`)
  - `unit_price = p.unit_price` (absolute price of the bottle/tube/vial; falls back to `strip_price` or `pack_total` if `unit_price` is null)

The mirrored `medicines` table update uses the same fields.

## 5. Outcome reporting

Add a per-row `format` field to the `samples` payload so we can verify in logs which branch ran. No new outcome codes; non-strip rows that match still report `matched`.

## 6. Out of scope

- No schema changes (`pack_size`, `pcs_per_strip`, `strip_per_pack`, `unit_price` columns already exist).
- No changes to cron schedule, batch limit, auth, or progress-tracking logic.
- No retroactive re-processing of rows already marked `math_mismatch`; next cron tick will re-examine them only if they fall back into the offset window. (If you want a one-shot reset of `medex_status = 'math_mismatch'` rows so they get re-tried, say so and I'll add it.)

## Technical notes

- Format detection runs on the MedEx page (authoritative), not on the DB row, because `master_medicines` doesn't reliably carry a form column.
- All regexes are case-insensitive and tolerant of `&nbsp;`/extra whitespace (already normalized by `stripTags`).
- `approxEq` and tablet math remain untouched for the strip branch.
