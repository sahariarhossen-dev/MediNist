-- ==============================================================================
-- Migration: Drop overloaded process_stock_transfer(text) to resolve PGRST203
-- ==============================================================================
-- PostgREST cannot choose between process_stock_transfer(text) and 
-- process_stock_transfer(uuid) because JSON strings match both types.
-- Dropping the text overload leaves the single authoritative UUID function.

DROP FUNCTION IF EXISTS public.process_stock_transfer(text);
