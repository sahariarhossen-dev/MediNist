// Scheduled edge function: closes the previous day for each pharmacy
// and writes a `daily_closings` row whose net_balance carries forward.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the caller. This endpoint is intended for the scheduled
    // cron job and authorized admins only — it must never be invoked
    // anonymously since it uses the service role key and rewrites
    // pharmacy-wide financial records.
    const cronSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("Authorization") ?? "";
    const providedSecret =
      req.headers.get("x-cron-secret") ??
      (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "");

    if (!cronSecret || providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Allow override via body { date: 'YYYY-MM-DD' } for manual runs/tests.
    let targetDate: Date;
    try {
      const body = await req.json();
      targetDate = body?.date ? new Date(body.date) : yesterdayUTC();
    } catch {
      targetDate = yesterdayUTC();
    }

    const dateStr = targetDate.toISOString().slice(0, 10);
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`).toISOString();
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`).toISOString();

    // Get all distinct pharmacies that had any activity that day
    // (sales, cash_transactions, or customer_dues).
    const [salesPharma, cashPharma, duesPharma] = await Promise.all([
      supabase
        .from("sales")
        .select("pharmacy_id")
        .eq("status", "completed")
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd),
      supabase
        .from("cash_transactions")
        .select("pharmacy_id")
        .gte("occurred_at", dayStart)
        .lte("occurred_at", dayEnd),
      supabase
        .from("customer_dues")
        .select("pharmacy_id")
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd),
    ]);

    const pharmacyIds = new Set<string>();
    for (const row of salesPharma.data ?? []) pharmacyIds.add(row.pharmacy_id);
    for (const row of cashPharma.data ?? []) pharmacyIds.add(row.pharmacy_id);
    for (const row of duesPharma.data ?? []) pharmacyIds.add(row.pharmacy_id);

    const results: Array<Record<string, unknown>> = [];

    for (const pharmacyId of pharmacyIds) {
      const [salesRes, cashRes, duesRes, prevClosingRes, settingsRes] =
        await Promise.all([
          supabase
            .from("sales")
            .select("total")
            .eq("pharmacy_id", pharmacyId)
            .eq("status", "completed")
            .gte("created_at", dayStart)
            .lte("created_at", dayEnd),
          supabase
            .from("cash_transactions")
            .select("direction,category,amount")
            .eq("pharmacy_id", pharmacyId)
            .gte("occurred_at", dayStart)
            .lte("occurred_at", dayEnd),
          supabase
            .from("customer_dues")
            .select("amount_due,amount_paid")
            .eq("pharmacy_id", pharmacyId)
            .gte("created_at", dayStart)
            .lte("created_at", dayEnd),
          supabase
            .from("daily_closings")
            .select("net_balance,closing_date")
            .eq("pharmacy_id", pharmacyId)
            .lt("closing_date", dateStr)
            .order("closing_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("pharmacy_settings")
            .select("starting_cash_balance")
            .eq("pharmacy_id", pharmacyId)
            .maybeSingle(),
        ]);

      const totalSales = (salesRes.data ?? []).reduce(
        (s, r: any) => s + Number(r.total || 0),
        0,
      );
      const totalCashIn = (cashRes.data ?? [])
        .filter(
          (t: any) =>
            t.direction === "in" &&
            (t.category === "other_in" || t.category === "due_collection"),
        )
        .reduce((s, t: any) => s + Number(t.amount || 0), 0);
      const totalPayments = (cashRes.data ?? [])
        .filter((t: any) => t.direction === "out")
        .reduce((s, t: any) => s + Number(t.amount || 0), 0);
      const totalDue = (duesRes.data ?? []).reduce(
        (s, r: any) =>
          s + Math.max(0, Number(r.amount_due || 0) - Number(r.amount_paid || 0)),
        0,
      );

      const startingBalance = prevClosingRes.data
        ? Number(prevClosingRes.data.net_balance || 0)
        : Number(settingsRes.data?.starting_cash_balance ?? 0);

      const netBalance =
        startingBalance +
        Math.max(0, totalSales - totalDue) +
        totalCashIn -
        totalPayments;

      const upsert = await supabase
        .from("daily_closings")
        .upsert(
          {
            pharmacy_id: pharmacyId,
            closing_date: dateStr,
            starting_balance: startingBalance,
            total_sales: totalSales,
            total_cash_in: totalCashIn,
            total_payments: totalPayments,
            total_due: totalDue,
            net_balance: netBalance,
            closed_at: new Date().toISOString(),
          },
          { onConflict: "pharmacy_id,closing_date" },
        )
        .select()
        .single();

      results.push({
        pharmacy_id: pharmacyId,
        ok: !upsert.error,
        error: upsert.error?.message,
        net_balance: netBalance,
      });
    }

    return new Response(
      JSON.stringify({ date: dateStr, processed: results.length, results }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    console.error("close-daily-transactions error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});

function yesterdayUTC(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
