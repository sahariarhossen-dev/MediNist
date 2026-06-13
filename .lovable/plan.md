## Goal
Make medicine search hyphen- and space-insensitive everywhere, so typing `afenac` finds `A-Fenac`, and `b9` finds `B-9`.

## Current state (already correct ✅)
- `src/lib/searchUtils.ts` → `normalizeForSearch()` already strips everything except `a–z0–9`.
- **Inventory local inventory list** (`src/pages/Inventory.tsx`, `filteredMedicines`) already uses `normalizeForSearch` on both sides → already hyphen-insensitive.
- **Sales / Billing search** (`src/pages/CreateSale.tsx`) calls the `search_medicines` Postgres RPC, which uses `regexp_replace(lower(...), '[^a-z0-9]', '', 'g')` on both column and query → already hyphen-insensitive.
- **Catalog Search page** (`src/pages/CatalogSearch.tsx`) and `AddProductTargetSheet` also already use the same normalized path.

## The one real gap ❌
`src/pages/Inventory.tsx` — the **“From Catalog” section** (server-side query on `master_medicines`) uses Postgres full-text search on the generated `search_vector` column via `toTsQuery()`. Postgres' `simple` FTS tokenizes `A-Fenac` into separate tokens `a` and `fenac`, so the prefix query `afenac:*` never matches. This is the source of the bug for the catalog half of Inventory search.

## Fix

### 1. New Postgres RPC for hyphen-insensitive catalog search
Add a migration creating:

```sql
create or replace function public.search_master_medicines(
  _query text,
  _companies text[] default null,
  _limit int default 200
)
returns setof public.master_medicines
language sql stable security invoker
set search_path = public
as $$
  with norm as (
    select regexp_replace(lower(coalesce(_query,'')), '[^a-z0-9]', '', 'g') as q
  )
  select m.*
  from public.master_medicines m, norm
  where (_companies is null or m.company = any(_companies))
    and (
      norm.q = ''
      or regexp_replace(lower(m.brand_name), '[^a-z0-9]', '', 'g') like '%'||norm.q||'%'
      or regexp_replace(lower(coalesce(m.generic_name,'')), '[^a-z0-9]', '', 'g') like '%'||norm.q||'%'
      or regexp_replace(lower(coalesce(m.company,'')), '[^a-z0-9]', '', 'g') like '%'||norm.q||'%'
    )
  order by
    case when regexp_replace(lower(m.brand_name), '[^a-z0-9]', '', 'g')
              like (select q from norm) || '%' then 0 else 1 end,
    m.brand_name
  limit _limit;
$$;

grant execute on function public.search_master_medicines(text, text[], int) to authenticated;
```

(Existing `search_vector` column stays — only the Inventory catalog query path switches off it.)

### 2. Switch Inventory’s catalog effect to the new RPC
In `src/pages/Inventory.tsx`, inside the `useEffect` that currently builds the `master_medicines` query (lines ~219–243):

- Remove the `toTsQuery` / `textSearch("search_vector", …)` branch.
- Replace the whole query with:
  ```ts
  const { data, error } = await supabase.rpc("search_master_medicines", {
    _query: debouncedSearch || "",
    _companies: selectedCompanies.size ? Array.from(selectedCompanies) : null,
    _limit: 500,
  });
  ```
- `toTsQuery` becomes unused → delete the helper.

### 3. No other code changes
Sales/Billing, local Inventory filter, Catalog Search, and Add Product Target already use the normalized path. They are left untouched.

## Out of scope
- No changes to `medicines` table or its `search_vector`.
- No UI / styling changes.
- No edits to the existing `search_medicines` RPC.
