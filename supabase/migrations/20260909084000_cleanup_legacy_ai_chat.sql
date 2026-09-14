-- Cleanup legacy AI Chat tables, triggers, functions, and audit logs
-- 1. Drop trigger and function
DROP TRIGGER IF EXISTS ai_messages_after_insert_trg ON public.ai_messages;
DROP FUNCTION IF EXISTS public.ai_messages_after_insert() CASCADE;

-- 2. Drop dedicated AI tables in foreign-key dependency order
DROP TABLE IF EXISTS public.ai_thread_links CASCADE;
DROP TABLE IF EXISTS public.ai_messages CASCADE;
DROP TABLE IF EXISTS public.ai_conversations CASCADE;
DROP TABLE IF EXISTS public.medex_cache CASCADE;

-- 3. Clean up only AI-specific logs from the shared staff_activity_logs table
DELETE FROM public.staff_activity_logs WHERE action_type LIKE 'ai_%';
