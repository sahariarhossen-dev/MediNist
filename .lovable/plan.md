## Plan

1. **Create the Supabase view**
   - Add a SQL migration with:
     ```sql
     CREATE OR REPLACE VIEW public.unique_companies AS
     SELECT DISTINCT company
     FROM public.master_medicines
     WHERE company IS NOT NULL AND company != ''
     ORDER BY company ASC;
     ```
   - This keeps the distinct company aggregation in Postgres instead of the React modal query.

2. **Update Inventory company loading**
   - In `src/pages/Inventory.tsx`, change the company fetch effect to query:
     ```ts
     supabase.from('unique_companies').select('*')
     ```
   - Keep the existing one-time fetch behavior when the filter sheet opens.
   - Keep the existing loading spinner, but ensure loading always stops on success or error so the modal cannot spin forever.

3. **Preserve local modal search**
   - Keep `companySearch` and `filteredCompanies` as client-side filtering only.
   - No database requests should run while typing in “Search companies...”.

4. **TypeScript compatibility**
   - Since generated Supabase types may not include the new view immediately, use the project’s existing typed Supabase client with a narrow local cast only for this view query.
   - Do not edit `src/integrations/supabase/types.ts` manually.

5. **Verify**
   - Confirm `Inventory.tsx` no longer queries `master_medicines` for the modal company list.
   - The modal remains scrollable/mobile-first and the internal search continues to filter instantly on the fetched list.