Build a full interactive demo sandbox for MediNist that replaces the landing page "Watch Demo" button with an instant, isolated, auto-resetting live demo.

Architecture choice

Use a per-session ephemeral Supabase demo tenant:

- One fresh demo auth user + pharmacy is created per visitor.
- The demo user is signed in automatically and redirected to /dashboard.
- The demo user can read, write, sell, add products, run reports, and use the AI assistant just like a real admin.
- The demo session is time-boxed (e.g., 4 hours). After expiry, or on explicit "Exit Demo", the auth user, pharmacy, and all associated rows are deleted.
- A cron job sweeps stale demo sessions every 30 minutes.

This approach gives zero risk to production data, real interactivity, and natural isolation. The alternative — a shared demo account with local state overlays — would require rewriting every data query in the app and could leak data between visitors.


Phase 1: Database schema & seed utilities

1. Add sandbox columns to public.pharmacies
   - is_demo boolean NOT NULL DEFAULT false
   - demo_expires_at timestamp with time zone
   - Grant SELECT on public.pharmacies to anon (already present) and authenticated/service_role as needed.

2. Add sandbox flag to public.profiles
   - is_demo boolean NOT NULL DEFAULT false
   - Used by the frontend for quick, RLS-safe demo detection.

3. Create a security-definer Postgres function seed_demo_pharmacy(target_pharmacy_id uuid, target_user_id uuid)
   - Inserts a realistic Bangladeshi pharmacy seed set in one transaction:
     - 30 medicines (e.g., Napa 500 mg, Sergel 20 mg, Seclo 20 mg, Alatrol 10 mg, Monas 10 mg) with stock_quantity, stock_alert, price, pcs_per_strip, strip_per_pack, product_type, expiry_date, company_name, generic_name, strength.
     - 8 sample customers with names, phone, address, total_due.
     - 12 completed sales with sale_items, created_at spread across today and the last 30 days.
     - Customer ledger entries for any due sales.
     - Cash transactions for today (due collections, expenses, investments) so "Cash in Hand" matches.
     - A daily_closing row for yesterday.
   - All rows are tagged to the target pharmacy_id and user_id.
   - The pharmacy is also seeded with default_discount and a far-future subscription_expiry so no paywall blocks the demo.

4. Create a security-definer Postgres function cleanup_demo_sessions()
   - Deletes all rows belonging to pharmacies where is_demo = true and demo_expires_at < now().
   - Deletes the associated auth users via supabase_admin API in the edge function (auth.users cannot be deleted directly from SQL).
   - Wraps deletions in a transaction where possible.

5. Update GRANTs and RLS policies
   - Ensure service_role can write all seeded tables.
   - Existing authenticated policies (pharmacy-scoped) continue to protect real users. No changes needed to user-facing policies.


Phase 2: Edge function — create-demo-session

1. New file: supabase/functions/create-demo-session/index.ts
   - Verify JWT disabled in supabase/config.toml so anonymous visitors can call it.
   - Generate a random email like demo_xxxxxxxx@demo.medinist.app and a secure password.
   - Use the service-role Supabase client to:
     - Create the auth user with email_confirmed = true.
     - Insert a public.pharmacies row with is_demo = true and demo_expires_at = now() + 4 hours.
     - Update the auto-created profile (via auth trigger) to set pharmacy_id, role = 'admin', full_name = 'Demo Pharmacist', is_demo = true, terms_accepted = true, terms_accepted_at = now().
     - Call seed_demo_pharmacy(pharmacy_id, user_id) via RPC.
   - Use the anon Supabase client to sign in with the generated credentials and return the session.
   - Set the response to include a demo flag: demo: true, expires_at.
   - Handle and log errors with rollback if creation fails.


Phase 3: Cleanup edge function + cron

1. New file: supabase/functions/cleanup-demo-sessions/index.ts
   - Accept an x-cron-secret header for cron authentication.
   - Use service-role client to query pharmacies where is_demo = true and demo_expires_at < now().
   - For each expired demo pharmacy, delete the associated auth user and then call the cleanup function to delete pharmacy rows.
   - Return count of cleaned sessions.

2. Add a Supabase cron job cleanup-demo-sessions that calls the edge function every 30 minutes with the x-cron-secret header.

3. Add a beforeunload / sendBeacon handler in the frontend so closing the tab attempts immediate cleanup, but the cron remains the reliable fallback.


Phase 4: Frontend auth state

1. Update src/contexts/AuthContext.tsx
   - Add isDemo: boolean to the context value.
   - Detect demo mode by checking localStorage flag (set after demo login) and by verifying profile.is_demo === true.
   - Extend signOut to:
     - Call cleanup-demo-sessions if isDemo is true.
     - Clear the demo localStorage flag.
     - Call supabase.auth.signOut().
     - Redirect to /.

2. Add a small helper hook useDemoSession() (or inline in AuthContext) that stores the demo session ID and expiry in localStorage and refreshes the flag on auth state changes.


Phase 5: Landing page hero update

1. Update src/pages/Landing.tsx
   - Replace the "Watch Demo" button with "Explore Live Demo".
   - Use a Rocket / Sparkles / Play icon from lucide-react.
   - On click:
     - Show a loading state.
     - Call supabase.functions.invoke('create-demo-session').
     - Set the returned session with supabase.auth.setSession().
     - Store demo flag in localStorage.
     - Redirect to /dashboard.
   - Handle errors with toast and a fallback message.


Phase 6: Demo UI components

1. New component: src/components/DemoBanner.tsx
   - Fixed top banner on all protected routes inside AppLayout.
   - Text: "🧪 Demo Mode Active: Feel free to test all features and add mock transactions! Data resets automatically upon exit."
   - Includes an "Exit Demo" button.

2. Update src/components/AppLayout.tsx
   - Render DemoBanner when isDemo is true.
   - Ensure banner does not overlap the bottom nav on mobile.

3. Update src/components/AppHeader.tsx
   - Add an "Exit Demo" button in the header for desktop/tablet views.
   - Keep the existing avatar and notifications.


Phase 7: Guard sensitive settings in demo mode

1. Update src/pages/Profile.tsx
   - Hide the password change section.
   - Disable email update / account deletion UI.
   - Show a read-only "Demo Account" notice.

2. Update src/pages/ShopProfile.tsx
   - Disable staff invite functionality (do not send real emails from demo).
   - Disable changing the pharmacy name, email, or licenses.
   - Allow safe settings like default_discount and invoice_footer so the demo still feels interactive.

3. Update src/pages/Subscription.tsx and SubscriptionCheckout.tsx
   - If isDemo is true, show a friendly message: "Subscription checkout is not available in demo mode. Create a real account to subscribe." with a CTA to /register.

4. Add a demo guard in App.tsx routing or use a wrapper DemoGuard component that redirects sensitive routes to /dashboard in demo mode.


Phase 8: Seed data details

The seed function will include at minimum:

- Medicines: 30 rows covering tablets, capsules, syrups, injections, creams, inhalers with realistic pack sizes and prices in BDT.
- Stock alerts: 3-5 medicines below alert threshold and 2-3 with expiry_date within 30 days.
- Customers: 8 Bangladeshi customer names with mobile numbers and small due balances.
- Sales: 12 completed invoices with timestamps across the last 30 days, including 3-4 for today.
- Cash ledger: payments and due collections for today so dashboard "Cash in Hand" is non-zero.
- Daily closing: yesterday's closing with starting balance.

All IDs are generated with gen_random_uuid(). Sales use the existing complete_sale RPC-compatible structure, but the seed function will insert directly for speed.


Phase 9: Testing & verification

1. Deploy the two edge functions and verify with a curl test.
2. Run the cleanup edge function manually and verify it removes expired demo rows.
3. Test the landing page flow end-to-end:
   - Click "Explore Live Demo".
   - Land on /dashboard with demo banner visible.
   - Verify dashboard cards show seeded data.
   - Verify stock alerts show low-stock items.
   - Create a new sale and invoice.
   - Add a new medicine.
   - Verify the new rows appear in the UI.
4. Exit the demo and verify the user is signed out and the demo data is deleted.
5. Verify the cron job is scheduled and running.
6. Run a TypeScript build check to ensure no type errors.


Acceptance criteria

- [ ] Landing page shows "Explore Live Demo" with a distinctive icon.
- [ ] Clicking it creates a fresh demo session and redirects to /dashboard within a few seconds.
- [ ] Dashboard loads with realistic sales, inventory, customers, and stock alerts.
- [ ] Users can add medicines, create sales, and view reports without restrictions.
- [ ] A persistent demo banner appears with an Exit Demo button.
- [ ] Password change, email change, billing, and staff invites are disabled or hidden in demo mode.
- [ ] Exit Demo signs the user out and deletes the demo tenant data.
- [ ] Stale demo sessions are automatically cleaned up by cron.
- [ ] No production user data is exposed or modified by demo sessions.
