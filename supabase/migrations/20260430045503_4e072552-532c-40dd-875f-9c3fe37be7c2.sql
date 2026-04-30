REVOKE EXECUTE ON FUNCTION public.increment_product_target_progress(uuid, uuid, uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sale_item_increment_targets() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sale_completed_backfill_targets() FROM PUBLIC, anon, authenticated;