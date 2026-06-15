// Deno unit tests for buildPharmacyContext — verifies RBAC scoping for
// owner / manager / salesman roles using a hand-rolled Supabase stub
// (no network, no env vars required).

import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertNoForbiddenFields,
  buildPharmacyContext,
  SupabaseLike,
} from "./contextBuilder.ts";
import type { Role } from "./shared.ts";

// ---------- Stub Supabase client ----------

type QueryOp = { type: string; args: unknown[] };
type QueryCall = { table: string | null; rpc: string | null; ops: QueryOp[] };

function makeStub(fixtures: Record<string, unknown[]>) {
  const calls: QueryCall[] = [];

  function makeQuery(call: QueryCall, rows: unknown[]) {
    const q: Record<string, unknown> & PromiseLike<unknown> = {} as any;
    const record = (type: string, ...args: unknown[]) => {
      call.ops.push({ type, args });
      return q;
    };
    q.select = (...a: unknown[]) => record("select", ...a);
    q.eq = (...a: unknown[]) => record("eq", ...a);
    q.gt = (...a: unknown[]) => record("gt", ...a);
    q.gte = (...a: unknown[]) => record("gte", ...a);
    q.order = (...a: unknown[]) => record("order", ...a);
    q.limit = (...a: unknown[]) => record("limit", ...a);
    // Promise-like: resolves with { data, error }
    q.then = (onResolved: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(onResolved);
    return q;
  }

  const stub: SupabaseLike = {
    from(table: string) {
      const call: QueryCall = { table, rpc: null, ops: [] };
      calls.push(call);
      return makeQuery(call, fixtures[table] ?? []);
    },
    rpc(name: string) {
      const call: QueryCall = { table: null, rpc: name, ops: [] };
      calls.push(call);
      return Promise.resolve({ data: fixtures[`rpc:${name}`] ?? [], error: null });
    },
  };

  return { stub, calls };
}

// ---------- Shared fixtures ----------

const PHARMACY_ID = "pharm-1";
const ME = "user-A";
const OTHER = "user-B";
const nowIso = () => new Date().toISOString();

function baseFixtures() {
  return {
    medicines: [
      { name: "Napa", company_name: "Beximco", stock_quantity: 5, price: 1.2, expiry_date: "2026-12-01", stock_alert: 10 },
    ],
    sales: [
      { id: "s1", total: 100, created_at: nowIso(), sale_type: "cash", status: "ok", pharmacy_id: PHARMACY_ID, user_id: ME },
      { id: "s2", total: 200, created_at: nowIso(), sale_type: "cash", status: "ok", pharmacy_id: PHARMACY_ID, user_id: OTHER },
    ],
    sale_items: [
      { medicine_name: "Napa", quantity: 2, total_price: 100, created_at: nowIso(), sale_id: "s1" },
    ],
    cash_transactions: [
      { amount: 500, direction: "in", category: "sale_cash", occurred_at: nowIso() },
      { amount: 50, direction: "out", category: "supplier", party_name: "Acme Supplies", note: "n/a", occurred_at: nowIso() },
    ],
    customers: [
      { name: "Mr X", phone: "017", total_due: 1234 },
    ],
    "rpc:get_pharmacy_member_directory": [
      { full_name: "Owner Bhai", role: "admin" },
      { full_name: "Manager Apa", role: "manager" },
      { full_name: "Sales A", role: "salesman" },
      { full_name: "Sales B", role: "salesman" },
    ],
  } as Record<string, unknown[]>;
}

// ---------- Helpers for assertions on query log ----------

function callsFor(calls: QueryCall[], table: string) {
  return calls.filter((c) => c.table === table);
}
function hasRpc(calls: QueryCall[], name: string) {
  return calls.some((c) => c.rpc === name);
}
function findOp(call: QueryCall, type: string, firstArg?: unknown) {
  return call.ops.find(
    (o) => o.type === type && (firstArg === undefined || o.args[0] === firstArg),
  );
}

// =========================================================================
// Tests
// =========================================================================

Deno.test("salesman: sales query is filtered by own user_id and no shop-wide blocks", async () => {
  const { stub, calls } = makeStub(baseFixtures());
  const out = await buildPharmacyContext(stub, PHARMACY_ID, "salesman" as Role, ME);

  // 1. The sales query has eq("user_id", ME)
  const salesCalls = callsFor(calls, "sales");
  assertEquals(salesCalls.length, 1, "exactly one sales query");
  const userEq = salesCalls[0].ops.find((o) => o.type === "eq" && o.args[0] === "user_id");
  assert(userEq, "sales query must filter by user_id for salesman");
  assertEquals(userEq!.args[1], ME);

  // 2. No queries for restricted tables / RPCs
  assertEquals(callsFor(calls, "sale_items").length, 0);
  assertEquals(callsFor(calls, "customers").length, 0);
  assertEquals(callsFor(calls, "cash_transactions").length, 0);
  assert(!hasRpc(calls, "get_pharmacy_member_directory"));

  // 3. Rendered string contains personal view, not shop-wide blocks
  assertStringIncludes(out, "Your personal sales");
  assert(!out.includes("Cash vs Online"));
  assert(!out.includes("Customer dues"));
  assert(!out.includes("Staff directory"));
  assert(!out.includes("Previous 7 days"));
});

Deno.test("manager: sales + expenses windows capped at 7 days, no cash-vs-online", async () => {
  const { stub, calls } = makeStub(baseFixtures());
  const out = await buildPharmacyContext(stub, PHARMACY_ID, "manager" as Role, ME);

  const sevenDayMs = 7 * 86400000;
  const tolerance = 60_000; // 1 minute

  // sales: gte on created_at within 7d window
  const salesCall = callsFor(calls, "sales")[0];
  const salesGte = salesCall.ops.find((o) => o.type === "gte" && o.args[0] === "created_at");
  assert(salesGte, "sales must have gte(created_at, ...)");
  const salesCutoff = new Date(salesGte!.args[1] as string).getTime();
  const expectedSales = Date.now() - sevenDayMs;
  assert(Math.abs(salesCutoff - expectedSales) < tolerance, "sales window must be ~7 days");

  // expenses (cash_transactions with direction=out): gte on occurred_at within 7d
  const cashCalls = callsFor(calls, "cash_transactions");
  // manager only queries the outflow (expenses) block, not cash-vs-online inflows
  assertEquals(cashCalls.length, 1, "manager hits cash_transactions once (expenses only)");
  const dirEq = cashCalls[0].ops.find((o) => o.type === "eq" && o.args[0] === "direction");
  assertEquals(dirEq?.args[1], "out");
  const expGte = cashCalls[0].ops.find((o) => o.type === "gte" && o.args[0] === "occurred_at");
  const expCutoff = new Date(expGte!.args[1] as string).getTime();
  assert(Math.abs(expCutoff - expectedSales) < tolerance, "expenses window must be ~7 days");

  // Staff RPC IS called for manager
  assert(hasRpc(calls, "get_pharmacy_member_directory"));

  // Output sanity
  assertStringIncludes(out, "Sales activity (last 7 days only)");
  assertStringIncludes(out, "Staff directory");
  assert(!out.includes("Cash vs Online"));
  assert(!out.includes("Previous 7 days"));
});

Deno.test("owner: full access — 120d sales window, cash-vs-online, dues, staff, no user_id filter", async () => {
  const { stub, calls } = makeStub(baseFixtures());
  const out = await buildPharmacyContext(stub, PHARMACY_ID, "owner" as Role, ME);

  // 120-day sales window
  const salesCall = callsFor(calls, "sales")[0];
  const salesGte = salesCall.ops.find((o) => o.type === "gte" && o.args[0] === "created_at");
  const cutoff = new Date(salesGte!.args[1] as string).getTime();
  const expected = Date.now() - 120 * 86400000;
  assert(Math.abs(cutoff - expected) < 60_000, "owner sales window must be ~120 days");

  // No user_id filter on sales
  const userEq = salesCall.ops.find((o) => o.type === "eq" && o.args[0] === "user_id");
  assert(!userEq, "owner must NOT filter sales by user_id");

  // Owner gets BOTH cash inflow query AND expenses outflow query → 2 calls on cash_transactions
  assertEquals(callsFor(calls, "cash_transactions").length, 2);

  // Dues, sale_items, staff RPC all queried
  assertEquals(callsFor(calls, "customers").length, 1);
  assertEquals(callsFor(calls, "sale_items").length, 1);
  assert(hasRpc(calls, "get_pharmacy_member_directory"));

  // Output contains all owner-only sections
  assertStringIncludes(out, "Cash vs Online");
  assertStringIncludes(out, "Customer dues");
  assertStringIncludes(out, "Staff directory");
  assertStringIncludes(out, "Daily sales (last 120 days)");
  assertStringIncludes(out, "Previous 7 days");
});

Deno.test("assertNoForbiddenFields: throws for restricted fields per role", () => {
  // owner: nothing forbidden
  assertNoForbiddenFields({ purchase_price: 10, salary: 1000 }, "owner");

  // manager: salary forbidden
  assertThrows(
    () => assertNoForbiddenFields({ foo: { salary: 50 } }, "manager"),
    Error,
    "salary",
  );

  // salesman: purchase_price forbidden
  assertThrows(
    () => assertNoForbiddenFields([{ purchase_price: 9 }], "salesman"),
    Error,
    "purchase_price",
  );

  // safe payload passes
  assertNoForbiddenFields({ name: "Napa", stock: 5 }, "salesman");
});