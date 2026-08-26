import { supabase } from "@/integrations/supabase/client";

/**
 * Records an attempted mutation that the server refused because the member is
 * under remote lock. The DB throttles to one row per minute per member and
 * verifies the caller really is read-only, so this is safe to fire-and-forget.
 */
export const reportReadOnlyBlock = (message: string | undefined, entity: string) => {
  if (!message || !/ACCESS_READ_ONLY/i.test(message)) return;
  void supabase.rpc("log_read_only_block" as any, { _entity: entity }).then(
    () => undefined,
    () => undefined,
  );
};
