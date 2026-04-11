

## Plan: Ensure Shop Logo Syncs After Upload

### What's Already Working
The Shop Profile page already has full image upload functionality:
- Logo upload with camera icon and file input
- Cover photo upload with camera icon overlay
- Supabase Storage integration (`pharmacy-assets` bucket)
- Updates `logo_url` and `cover_url` columns in `pharmacies` table
- More page fetches and displays the pharmacy logo

### The One Gap
The More page only fetches the pharmacy logo when `profile?.pharmacy_id` changes. If the user uploads a new logo on the Shop Profile page and navigates back, **the More page shows the stale logo** because the dependency hasn't changed.

### Fix — Single file: `src/pages/More.tsx`

**Re-fetch logo on every mount** by adding a trigger that runs when the component mounts (not just when `pharmacy_id` changes). This can be done by removing the stale cache — either:
- Add a timestamp or navigation key to the dependency, or
- Simply remove the conditional dependency so it re-fetches on every render/mount using a function that runs on focus/mount.

The simplest approach: use `useEffect` without the `pharmacy_id` guard as a stable dependency, or add a listener for window focus so the logo refreshes when the user returns from the Shop Profile page.

**Concrete change**: Wrap the fetch in a focus event listener so the logo auto-refreshes when returning to the More page:

```tsx
useEffect(() => {
  const fetchPharmacyLogo = async () => {
    if (!profile?.pharmacy_id) return;
    const { data } = await supabase
      .from("pharmacies")
      .select("logo_url")
      .eq("id", profile.pharmacy_id)
      .single();
    setPharmacyLogo(data?.logo_url ?? null);
  };
  
  fetchPharmacyLogo(); // fetch on mount
  
  // Also re-fetch when user returns to this tab/page
  window.addEventListener("focus", fetchPharmacyLogo);
  return () => window.removeEventListener("focus", fetchPharmacyLogo);
}, [profile?.pharmacy_id]);
```

### No database changes needed
Storage buckets and columns (`logo_url`, `cover_url`) already exist.

