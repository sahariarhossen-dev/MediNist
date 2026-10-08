import { supabase } from "@/integrations/supabase/client";

/**
 * Compute a pharmacy's cash-on-hand opening balance as of `dayStartISO`,
 * derived from all historical activity strictly before that timestamp.
 *
 * This mirrors the formula in `submit_blind_closing` and keeps the figure
 * continuous even when `daily_closings` has no row for the previous day.
 *
 * Formula:
 *   opening = pharmacy_settings.starting_cash_balance
 *           + max(0, completed_sales − new_dues)
 *           + due_collections
 *           + other_cash_in
 *           − payments
 *   (all sums taken over activity occurring strictly before dayStartISO)
 */

const PAGE = 1000;

async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  fallbackBuild?: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  let useFallback = false;
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    let { data, error } = useFallback && fallbackBuild ? await fallbackBuild(from, to) : await build(from, to);
    if (error && !useFallback && fallbackBuild && /location_id/i.test((error as any)?.message || "")) {
      useFallback = true;
      const res = await fallbackBuild(from, to);
      data = res.data;
      error = res.error;
    }
    if (error || !data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function getOpeningBalance(
  pharmacyId: string,
  dayStartISO: string,
  locationId?: string | null,
): Promise<number> {
  const isBranchSpecific = Boolean(locationId && locationId !== "all");

  const [salesRows, duesRows, txRows, settingsRes] = await Promise.all([
    pageAll<{ total: number | string }>(
      (f, t) => {
        let q = supabase
          .from("sales")
          .select("total")
          .eq("pharmacy_id", pharmacyId)
          .eq("status", "completed")
          .lt("created_at", dayStartISO);
        if (isBranchSpecific) {
          q = q.eq("location_id", locationId!);
        }
        return q.range(f, t);
      },
      (f, t) => {
        let q = supabase
          .from("sales")
          .select("total")
          .eq("pharmacy_id", pharmacyId)
          .eq("status", "completed")
          .lt("created_at", dayStartISO);
        if (isBranchSpecific) {
          q = q.eq("location_id", locationId!);
        }
        return q.range(f, t);
      },
    ),
    pageAll<{ amount: number | string }>(
      (f, t) => {
        let q = supabase
          .from("customer_ledger")
          .select("amount")
          .eq("pharmacy_id", pharmacyId)
          .eq("entry_type", "due")
          .lt("occurred_at", dayStartISO);
        if (isBranchSpecific) {
          q = q.eq("location_id", locationId!);
        }
        return q.range(f, t);
      },
      (f, t) => {
        let q = supabase
          .from("customer_ledger")
          .select("amount")
          .eq("pharmacy_id", pharmacyId)
          .eq("entry_type", "due")
          .lt("occurred_at", dayStartISO);
        if (isBranchSpecific) {
          q = q.eq("location_id", locationId!);
        }
        return q.range(f, t);
      },
    ),
    pageAll<{ direction: string; category: string; amount: number | string }>(
      (f, t) => {
        let q = supabase
          .from("cash_transactions")
          .select("direction,category,amount")
          .eq("pharmacy_id", pharmacyId)
          .lt("occurred_at", dayStartISO);
        if (isBranchSpecific) {
          q = q.eq("location_id", locationId!);
        }
        return q.range(f, t);
      },
      (f, t) => {
        let q = supabase
          .from("cash_transactions")
          .select("direction,category,amount")
          .eq("pharmacy_id", pharmacyId)
          .lt("occurred_at", dayStartISO);
        if (isBranchSpecific) {
          q = q.eq("location_id", locationId!);
        }
        return q.range(f, t);
      },
    ),
    supabase
      .from("pharmacy_settings")
      .select("starting_cash_balance")
      .eq("pharmacy_id", pharmacyId)
      .maybeSingle(),
  ]);

  const startingCash = isBranchSpecific
    ? 0
    : Number(
        (settingsRes.data as { starting_cash_balance?: number | string } | null)
          ?.starting_cash_balance ?? 0,
      );

  const totalSales = salesRows.reduce((s, r) => s + Number(r.total || 0), 0);
  const totalDues = duesRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const cashSales = Math.max(0, totalSales - totalDues);

  const dueReceived = txRows
    .filter((t) => t.direction === "in" && t.category === "due_collection")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const otherCashIn = txRows
    .filter((t) => t.direction === "in" && t.category === "other_in")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const payments = txRows
    .filter((t) => t.direction === "out")
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  return startingCash + cashSales + dueReceived + otherCashIn - payments;
}