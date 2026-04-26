# Flexible product search (ignore spaces, hyphens, special chars)

Make searches match regardless of hyphens, spaces, or other non-alphanumeric characters in either the query or the stored product name. "amactin", "a mactin", "a-mactin" should all match "A-mactin". Display names stay untouched — only matching is normalized.

## Approach

Normalize both sides of the comparison by stripping everything that isn't `a-z` or `0-9` and lowercasing. Apply this in three places that handle product search.

### 1. Shared helper — `src/lib/searchUtils.ts` (new)

```ts
export const normalizeForSearch = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
```

### 2. Inventory page — `src/pages/Inventory.tsx` (client-side)

- Replace the current `m.name.toLowerCase().includes(searchQuery.toLowerCase())` filter with `normalizeForSearch(m.name).includes(normalizeForSearch(searchQuery))`.
- Same for the catalog filter block (brand_name, generic_name, company).

### 3. Catalog Search page — `src/pages/CatalogSearch.tsx` (client-side)

- Replace the `q = searchQuery.toLowerCase()` + `.includes(q)` checks with normalized comparisons across `brand_name`, `generic_name`, and `company`.

### 4. Create Sale page — `src/pages/CreateSale.tsx` (server-side)

This is the only page using a Supabase server query (`ilike`). Switch to a normalized comparison using PostgreSQL's `regexp_replace`.

- Use `.or()` with a `regexp_replace` filter via Supabase's `filter()` builder, or call an RPC. Cleanest path: use the PostgREST `or` with a computed expression isn't supported — instead use `.filter()` which accepts raw column expressions only on the column itself. PostgREST does **not** allow function calls on the left side of a filter.
- **Solution**: create a small Postgres SQL function + use `.rpc()`, OR add a generated column + index. Lightweight choice for this app: a SQL function that returns matching medicine rows for a pharmacy + normalized query.

**New RPC (migration):**

```sql
create or replace function public.search_medicines(
  _pharmacy_id uuid,
  _query text
)
returns setof public.medicines
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from public.medicines
  where pharmacy_id = _pharmacy_id
    and regexp_replace(lower(name), '[^a-z0-9]', '', 'g')
        like '%' || regexp_replace(lower(_query), '[^a-z0-9]', '', 'g') || '%'
  order by
    case
      when regexp_replace(lower(name), '[^a-z0-9]', '', 'g')
           like regexp_replace(lower(_query), '[^a-z0-9]', '', 'g') || '%'
      then 0 else 1
    end,
    name
  limit 10;
$$;
```

RLS on `medicines` still applies because the function runs as `security invoker`.

**CreateSale change**: replace the two `ilike` queries with a single `supabase.rpc("search_medicines", { _pharmacy_id, _query: q })` call. Drop the dual starts-with/contains logic — ordering is done in SQL. Keep the 150ms debounce.

### 5. Prescription auto-add lookup (`CreateSale.tsx` line 212)

The `.ilike("name", presc.medicine_name)` exact-name lookup for prescriptions is intentionally exact and should stay as-is (it matches the prescription's stored medicine name verbatim). No change.

## Files touched

- New: `src/lib/searchUtils.ts`
- New migration: `search_medicines` SQL function
- Edited: `src/pages/Inventory.tsx`, `src/pages/CatalogSearch.tsx`, `src/pages/CreateSale.tsx`

## Out of scope

- Display names, stored data, and indexes are unchanged.
- Other text fields (customer names, companies in filters, notes search) are not touched — only product/medicine name search.
