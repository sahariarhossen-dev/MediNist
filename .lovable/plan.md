
## Goal

Permanently delete the pharmacy **"My Medical Hall"** (Pabna Sadar, Pabna) — id `a97b4639-4f16-425b-aca9-43e6899c2eb2` — and every row in this database scoped to that tenant.

## Why your script won't run as-is

The SQL you pasted targets `public.shops`, `public.inventory`, and a `shop_id` column. None of those exist in this project. The real multi-tenant schema uses:

- `public.pharmacies` (not `shops`), keyed by `id`
- `public.medicines` (not `inventory`)
- A `pharmacy_id` column on every tenant-scoped table (not `shop_id`)

Running your script verbatim would fail with `relation does not exist` and delete nothing.

## What will actually be deleted

Live counts for pharmacy `a97b4639-4f16-425b-aca9-43e6899c2eb2`:

| Table | Rows |
|---|---|
| medicines | 284 |
| staff_activity_logs | 14 |
| sale_items (via sales) | 12 |
| sales | 9 |
| customer_ledger | 5 |
| cash_transactions | 5 |
| shop_staff (invites) | 3 |
| customer_prescriptions | 2 |
| customers | 1 |
| pharmacies | 1 |
| Other tenant tables | 0 |

All other tenant tables (`customer_dues`, `daily_closings`, `staff_settings`, `product_targets`, `pharmacy_broadcasts`, `pharmacy_settings`, `subscription_payments`, `notes`, `chat_rooms`, `admin_override_requests`) are already empty for this tenant.

## Linked user profiles (need a decision)

These 4 profiles currently belong to this pharmacy:

- Shoriful Islam Roney — admin (phone 01716620188)
- Shihab — manager
- Md Emon khan — salesman
- Rocky — salesman

**Default in the plan:** detach them (set `pharmacy_id = NULL`, `role = 'salesman'`) so the underlying `auth.users` accounts survive and can join/create a new pharmacy later. The actual `auth.users` rows are **not** touched.

Tell me if you'd rather:
- (a) Detach profiles only — default, recommended
- (b) Also delete the `profiles` rows (auth users will remain but become orphaned)
- (c) Fully delete the auth users too (irreversible login loss)

## Migration plan (single transaction)

One migration that runs in this order so foreign keys stay satisfied:

```text
1. DELETE sale_items WHERE sale_id IN (SELECT id FROM sales WHERE pharmacy_id = $1)
2. DELETE sales                  WHERE pharmacy_id = $1
3. DELETE cash_transactions      WHERE pharmacy_id = $1
4. DELETE customer_ledger        WHERE pharmacy_id = $1
5. DELETE customer_prescriptions WHERE pharmacy_id = $1
6. DELETE customer_dues          WHERE pharmacy_id = $1
7. DELETE customers              WHERE pharmacy_id = $1
8. DELETE medicines              WHERE pharmacy_id = $1
9. DELETE product_targets        WHERE pharmacy_id = $1
10. DELETE staff_activity_logs   WHERE pharmacy_id = $1
11. DELETE staff_settings        WHERE pharmacy_id = $1
12. DELETE shop_staff            WHERE pharmacy_id = $1
13. DELETE pharmacy_broadcasts   WHERE pharmacy_id = $1
14. DELETE pharmacy_settings     WHERE pharmacy_id = $1
15. DELETE daily_closings        WHERE pharmacy_id = $1
16. DELETE subscription_payments WHERE pharmacy_id = $1
17. DELETE notes                 WHERE pharmacy_id = $1
18. DELETE admin_override_requests WHERE pharmacy_id = $1
19. DELETE chat_messages WHERE room_id IN (SELECT id FROM chat_rooms WHERE pharmacy_id = $1)
20. DELETE chat_room_members WHERE room_id IN (SELECT id FROM chat_rooms WHERE pharmacy_id = $1)
21. DELETE chat_rooms            WHERE pharmacy_id = $1
22. UPDATE profiles SET pharmacy_id = NULL, role = 'salesman' WHERE pharmacy_id = $1  -- option (a)
23. DELETE pharmacies WHERE id = $1
```

Wrapped in `BEGIN; ... COMMIT;` so a failure on any step rolls everything back.

## Out of scope

- Storage objects in `avatars` / `pharmacy-assets` / `chat-attachments` buckets are not auto-cleaned (no per-tenant prefix guarantee). Tell me if you want logo/cover URLs from this pharmacy purged too.
- No frontend code changes.

## Confirm before I run

Please confirm:
1. The target pharmacy is correct: **My Medical Hall — Pabna Sadar — id `a97b4639-4f16-425b-aca9-43e6899c2eb2`** (created 2026-06-10).
2. Profile handling choice: **(a) detach** (default), (b) delete profiles, or (c) delete auth users too.

Once you confirm, I'll switch to build mode and ship the migration.
