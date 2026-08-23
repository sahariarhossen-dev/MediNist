REVOKE ALL ON FUNCTION public.tg_block_read_only_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_block_read_only_staff() FROM anon;
REVOKE ALL ON FUNCTION public.tg_block_read_only_staff() FROM authenticated;