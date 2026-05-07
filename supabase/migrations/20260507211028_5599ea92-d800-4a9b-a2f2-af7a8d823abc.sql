-- Revoke EXECUTE from anon on all SECURITY DEFINER helper functions.
-- These are all designed for authenticated users; none should be callable
-- without signing in.
REVOKE EXECUTE ON FUNCTION public.is_pharmacy_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_pharmacy_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_pharmacy_public() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_member_names() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_member_directory() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_member_presence() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_staff_profile(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pharmacy_staff_overview() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_chat_inbox() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_room_admin(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_room(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_group_room(text, uuid[], text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_room_read(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.touch_last_seen() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.submit_blind_closing(numeric, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.extend_subscription(integer, numeric) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.search_medicines(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.increment_product_target_progress(uuid, uuid, uuid, timestamptz, integer) FROM anon, public;