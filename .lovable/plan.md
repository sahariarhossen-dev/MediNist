# MedEx Scraper: Retire the Sweep Cron, Add a Daily Refresh Pass

The initial sweep is done (845 pages, 25,287 rows). The current 5-minute cron now re-fetches an empty page 845 forever. Replace it with a refresh cycle that walks the catalog again from page 1 once per day and then idles.

## What changes

1. **Stop the wasteful loop** — unschedule the existing `medex-scraper-auto` job.
2. **Make the scraper idle-aware** — when the progress row is marked `finished`, the function returns immediately without fetching MedEx. This makes a frequent schedule harmless: it only works while a refresh cycle is open.
3. **Nightly refresh trigger** — a new daily cron (02:00 Dhaka / 20:00 UTC) resets the cursor: `next_page = 1`, `page_offset = 0`, `finished = false`. That opens a refresh cycle.
4. **Worker cron** — a job every 2 minutes calls `medex-scraper`. While a cycle is open it advances 15 brand pages per run; when it reaches the empty tail page it sets `finished = true` and every later run is a no-op until the next nightly reset.

Effect: one full catalog re-crawl per day, spread across the day at a polite crawl rate, and near-zero traffic once each cycle completes. Existing rows are upserted on `medex_url`, so prices and pack data refresh in place and the ~9,500 rows currently missing `unit_price` get re-attempted every cycle.

## Technical detail

- Edge function `supabase/functions/medex-scraper/index.ts`: add an early return when `progress.finished === true` and no explicit `?page=` override is passed (manual override still forces a run).
- Cron changes (run via the insert tool since they embed the project URL and vault secret, matching the pattern used by `cleanup-demo-sessions-auto`):
  - `cron.unschedule('medex-scraper-auto')`
  - `medex-refresh-reset` — `0 20 * * *` — SQL update on `medex_scrape_progress` setting `next_page=1, page_offset=0, finished=false, last_status='daily refresh cycle started'`
  - `medex-scraper-auto` — `*/2 * * * *` — `net.http_post` to the function with `timeout_milliseconds := 120000`
- No schema changes; `medex_scrape_progress` already carries `next_page`, `page_offset`, and `finished`.

## Verification after shipping

- Confirm the old job is gone and the two new jobs are active.
- Force-open a cycle once manually and confirm the cursor advances off page 1 and `total_scraped` climbs.
- Confirm a run with `finished = true` returns a skipped response without touching MedEx.
