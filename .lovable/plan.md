## Plan

1. **Update the live cron job**
   - Change `spider-catalog-sync-auto` so it still runs every 2 minutes.
   - Update its Edge Function URL from `limit=50&delay=2400` to `limit=15&delay=2400`.
   - Keep the existing `x-cron-secret` header and timeout settings unchanged.

2. **Update the Edge Function default/configuration**
   - Inspect `supabase/functions/spider-catalog-sync/index.ts`.
   - Change any default batch limit from `50` to `15`, so manual/cron calls without an explicit limit also stay under the 60-second Edge Function limit.

3. **Deploy and verify**
   - Deploy the updated `spider-catalog-sync` Edge Function.
   - Re-read `cron.job` to confirm the live cron command contains `limit=15` and schedule remains `*/2 * * * *`.
   - Re-read `spider_sync_progress` after the next tick to confirm `next_offset` starts moving beyond `20`.