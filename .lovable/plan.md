## Manual force-trigger of spider-catalog-sync

The cron tick has not advanced `next_offset` from 0. I will manually invoke the edge function and confirm progress.

### Steps

1. **Fire the edge function directly** via `supabase--curl_edge_functions` with the secret header:
   - Path: `/spider-catalog-sync`
   - Query: `auto=1`, `dry=0`, `limit=50`, `delay=1500`
   - Header: `x-cron-secret: <CRON_SECRET>`
   - Method: `GET`
   - Run in background-friendly mode (50 rows × 1.5s ≈ 75s + scraping → may approach edge timeout; if it times out mid-batch, progress will still be partially advanced on next tick).

2. **Verify** by querying `spider_sync_progress`:
   - `next_offset` should be `50`
   - `last_run_at` should be the current UTC timestamp
   - `matched_total` + `unmatched_total` should reflect the 50 scanned rows

3. **Inspect samples** from the response JSON to confirm Clonipres/Diatrol-style strict strength matching is working (or report any `no_strength_match` / `strength_mismatch` reasons returned).

4. **Report results** back to you with the new offset, counters, and any unmatched reasons from the first batch.

### Notes

- If the function returns a timeout, I will re-trigger with a smaller `limit` (e.g. 20) so the chunk fits inside the edge runtime budget, then let the 2-minute cron continue from the advanced offset.
- No code changes — pure runtime trigger.
