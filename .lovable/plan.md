# Update Supabase Configuration to Use Custom Proxy URL

## Goal
Replace all occurrences of the default Supabase project URL (`https://hjqcvidezzzkfipcneit.supabase.co`) with the custom Vercel proxy URL (`https://api.medinist.com`) so that all frontend data fetching, auth, and database requests route through the proxy.

## Files to Update

### 1. `.env`
Update the two URL entries:
- `SUPABASE_URL="https://api.medinist.com"`
- `VITE_SUPABASE_URL="https://api.medinist.com"`

The project ID and publishable key remain unchanged because the proxy forwards to the same Supabase project.

### 2. `src/integrations/supabase/client.ts`
Refactor the client initialization to read the URL from Vite environment variables instead of the current hard-coded string:

```ts
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://api.medinist.com";
```

The publishable key stays hard-coded (it does not need to change). All existing `createClient` options (`auth: { storage: localStorage, persistSession: true, autoRefreshToken: true }`) remain untouched.

### 3. `supabase/migrations/20260418065607_04b570e9-4cc4-4438-87f4-ea576df1b32a.sql`
Update the `net.http_post` URL inside the `close-daily-transactions-midnight` cron job so the server-side trigger also calls the proxy:

```sql
url := 'https://api.medinist.com/functions/v1/close-daily-transactions',
```

The `Authorization` bearer token (anon key) stays the same.

## Out of Scope
- `supabase/config.toml` — the `project_id` field is the Supabase CLI identifier, not an HTTP endpoint, so it does not change.
- Any other Supabase project settings or keys.

## Verification
After the changes, a quick `grep` for the old Supabase URL should return zero results in `.env`, `src/integrations/supabase/client.ts`, and the migration file.