

## Plan: Optimize Search with "Starts With" Priority

### Problem
The CreateSale search uses `ilike('%query%')` which returns "contains" matches without prioritization. "osertil" ranks equally with "sergel" when searching "ser".

### Changes

**1. `src/pages/CreateSale.tsx` — Two-tier search with starts-with priority**

Replace the single `ilike('%query%')` query with two queries run in parallel:
- Query 1: `ilike('query%')` — medicines starting with the search term
- Query 2: `ilike('%query%')` — medicines containing the search term anywhere

Merge results: starts-with matches first, then contains matches (deduplicated). Limit total to 10.

Also reduce debounce from 300ms to 150ms for snappier results.

```typescript
// Pseudocode for the new search
const q = searchQuery.trim().toLowerCase();
const [startsRes, containsRes] = await Promise.all([
  supabase.from("medicines")...ilike("name", `${q}%`).limit(10),
  supabase.from("medicines")...ilike("name", `%${q}%`).limit(10),
]);
const startsWith = startsRes.data || [];
const startIds = new Set(startsWith.map(m => m.id));
const contains = (containsRes.data || []).filter(m => !startIds.has(m.id));
setSearchResults([...startsWith, ...contains].slice(0, 10));
```

**2. `src/pages/AddCompany.tsx` — Client-side starts-with priority sort**

Update the `filtered` variable to sort starts-with matches before contains matches:

```typescript
const filtered = companies
  .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
  .sort((a, b) => {
    const q = search.toLowerCase();
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return aStarts - bStarts || a.name.localeCompare(b.name);
  });
```

### Files affected
- `src/pages/CreateSale.tsx` — two-tier Supabase search + faster debounce
- `src/pages/AddCompany.tsx` — client-side sort prioritization

