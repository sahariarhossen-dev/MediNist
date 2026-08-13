-- 1. Remove anonymous read access to sensitive tenant data
DROP POLICY IF EXISTS "Allow read-only select for dashboard" ON public.pharmacies;
DROP POLICY IF EXISTS "Allow read-only select for dashboard" ON public.profiles;
DROP POLICY IF EXISTS "Allow read-only select for dashboard" ON public.subscription_payments;
REVOKE ALL ON public.pharmacies FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.subscription_payments FROM anon;

-- 2. Admin audit log: backend only
DROP POLICY IF EXISTS "audit readable" ON public.admin_actions;
REVOKE ALL ON public.admin_actions FROM anon, authenticated;
GRANT ALL ON public.admin_actions TO service_role;

-- 3. Feature flags: scoped to the owning pharmacy
DROP POLICY IF EXISTS "flags readable" ON public.shop_feature_flags;
CREATE POLICY "Members read own pharmacy flags"
  ON public.shop_feature_flags FOR SELECT TO authenticated
  USING (pharmacy_id = public.get_user_pharmacy_id());
REVOKE ALL ON public.shop_feature_flags FROM anon;
GRANT SELECT ON public.shop_feature_flags TO authenticated;
GRANT ALL ON public.shop_feature_flags TO service_role;

-- 4. Analytics views must respect the querying user's RLS
ALTER VIEW public.admin_shop_stats SET (security_invoker = true);
ALTER VIEW public.admin_activity_stats SET (security_invoker = true);
ALTER VIEW public.admin_ai_stats SET (security_invoker = true);
ALTER VIEW public.admin_daily_sales SET (security_invoker = true);
ALTER VIEW public.admin_top_medicines SET (security_invoker = true);
ALTER VIEW public.admin_screen_time SET (security_invoker = true);
ALTER VIEW public.admin_page_engagement SET (security_invoker = true);
ALTER VIEW public.admin_ai_daily SET (security_invoker = true);
ALTER VIEW public.admin_ai_topics SET (security_invoker = true);

-- 5. Subscription extension is server-side only
REVOKE EXECUTE ON FUNCTION public.extend_subscription(integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_subscription(integer, numeric) TO service_role;

-- 6. Invitation lookup no longer anon-callable (edge function uses service role)
REVOKE EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) FROM PUBLIC, anon;