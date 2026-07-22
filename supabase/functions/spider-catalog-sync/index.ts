// MedEx cross-verification scraper for master_medicines + medicines.
// Auth: header `x-cron-secret` == CRON_SECRET, OR `apikey` == SERVICE_ROLE_KEY.
// Query: limit (default 15, max 100), offset, dry (default 1), delay (ms),
// auto=1 to read/advance spider_sync_progress.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const FORMAT_WORDS = new Set([
  "tablet","capsule","syrup","suspension","injection","cream","ointment",
  "gel","drops","drop","inhaler","inhalation","spray","solution","lotion",
  "powder","sachet","vial","ampoule","suppository","lozenge","granules",
  "liquid","mouthwash","shampoo","soap","wash","paste","oil","emulsion",
  "bolus","pessary","film","patch","wafer","mdi","mdpi","dpi","nebuliser",
  "nebulizer","eye","ear","nasal","oral","iv","im","sc","pfs",
]);

async function medexFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      console.error("medex http", res.status, url);
      await res.body?.cancel();
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error("medex fetch error", url, String(e));
    return null;
  }
}

function findBrandUrls(html: string): string[] {
  const out: string[] = [];
  const re = /href="(https?:\/\/medex\.com\.bd\/brands\/\d+\/[^"]+|\/brands\/\d+\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let u = m[1].replace(/&amp;/g, "&");
    if (u.startsWith("/")) u = "https://medex.com.bd" + u;
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

function brandCoreToken(name: string): string {
  return name
    .toLowerCase()
    .split(/[\s/]+/)
    .filter((t) => t && !FORMAT_WORDS.has(t.replace(/[^a-z]/g, "")))
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

function slugCore(url: string): string {
  return (url.split("/").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function norm(v: string | null | undefined): string {
  return (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function genericTokens(v: string | null | undefined): Set<string> {
  return new Set(
    (v || "")
      .toLowerCase()
      .replace(/[^a-z0-9+]/g, " ")
      .split(/\s+/)
      .filter((t) => t && t.length > 2),
  );
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

interface BrandPage {
  brand_title: string | null;
  generic_text: string | null;
  strength_text: string | null;
  company_text: string | null;
  unit_price: number | null;
  strip_price: number | null;
  pack_total: number | null;
  pack_text: string | null;
  pcs_per_strip: number | null;
  strip_per_pack: number | null;
  format: "strip" | "liquid" | "semisolid" | "single";
  container_text: string | null;
  container_qty: number | null;
  container_unit: "ml" | "g" | "vial" | "ampoule" | "bottle" | "tube" | "pcs" | null;
}

function detectFormat(
  brandTitle: string | null,
  packText: string | null,
): BrandPage["format"] {
  const t = (brandTitle || "").toLowerCase();
  const p = (packText || "").toLowerCase();
  // single-unit containers
  if (/\b(injection|infusion|iv|im|pfs)\b/.test(t)) return "single";
  if (/\b(vial|ampoule|amp)\b/.test(p) || /\b(vial|ampoule)\b/.test(t)) return "single";
  // semi-solids (weight in g/gm)
  if (/\b(cream|ointment|gel|lotion|paste|oil|emulsion)\b/.test(t)) return "semisolid";
  if (/\b\d+(?:\.\d+)?\s*(?:gm|g)\b.*\b(tube|jar|pot)\b/.test(p)) return "semisolid";
  // liquids (volume in ml)
  if (/\b(syrup|suspension|drops?|solution|spray|inhaler|inhalation|mouthwash|nebuliser|nebulizer|shampoo|wash|liquid)\b/.test(t)) return "liquid";
  if (/\b\d+(?:\.\d+)?\s*ml\b/.test(p) || /\bbottle\b/.test(p)) return "liquid";
  // tube fallback
  if (/\btube\b/.test(p)) return "semisolid";
  return "strip";
}

function parseBrandPage(html: string): BrandPage {
  const out: BrandPage = {
    brand_title: null, generic_text: null, strength_text: null, company_text: null,
    unit_price: null, strip_price: null, pack_total: null,
    pack_text: null, pcs_per_strip: null, strip_per_pack: null,
    format: "strip", container_text: null, container_qty: null, container_unit: null,
  };

  // Brand title: <h1 ...>Amloten <small>Tablet</small></h1>
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (titleMatch) out.brand_title = stripTags(titleMatch[1]);

  // Generic: link to /generics/...
  const genMatch = html.match(/<a[^>]*href="[^"]*\/generics\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i);
  if (genMatch) out.generic_text = stripTags(genMatch[1]);

  // Strength: <div class="dosage-form">5 mg+50 mg</div> OR similar div with strength
  // Look for first standalone strength-like text after the brand title.
  // Pattern: any line in first 8KB that looks like a dose (mg/mcg/ml/%/iu/g)
  // possibly combined with "+".
  const head = html.slice(0, 12000);
  const doseMatch = head.match(/>\s*(\d+(?:\.\d+)?\s*(?:mg|mcg|ml|%|iu|gm|g)(?:\s*\+\s*\d+(?:\.\d+)?\s*(?:mg|mcg|ml|%|iu|gm|g))*)\s*</i);
  if (doseMatch) out.strength_text = doseMatch[1].trim();

  // Company: <a href="/manufacturers/..."> ACME Laboratories Ltd. </a>
  const compMatch = html.match(/<a[^>]*href="[^"]*\/manufacturers\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i);
  if (compMatch) out.company_text = stripTags(compMatch[1]);

  // Package container
  const block = html.match(/<div class="package-container[\s\S]*?<\/div>\s*<\/div>/);
  const scope = block ? block[0] : html;

  const unitM = scope.match(/Unit Price:[\s\S]*?৳\s*([\d,]+(?:\.\d+)?)/i);
  if (unitM) out.unit_price = parseFloat(unitM[1].replace(/,/g, ""));

  const stripM = scope.match(/Strip Price:[\s\S]*?৳\s*([\d,]+(?:\.\d+)?)/i);
  if (stripM) out.strip_price = parseFloat(stripM[1].replace(/,/g, ""));

  const packM = scope.match(/class="pack-size-info"[\s\S]*?>\s*([\s\S]*?)<\/span>/i);
  if (packM) {
    const raw = packM[1].replace(/\s+/g, " ").trim().replace(/^\(|\)$/g, "");
    out.pack_text = raw;
    const totalM = raw.match(/:\s*৳\s*([\d,]+(?:\.\d+)?)/);
    if (totalM) out.pack_total = parseFloat(totalM[1].replace(/,/g, ""));
  }

  // Detect format from title + pack text
  out.format = detectFormat(out.brand_title, out.pack_text);

  if (out.format === "strip") {
    const raw = out.pack_text ?? "";
    const nxm = raw.match(/(\d+)\s*[xX×]\s*(\d+)/);
    if (nxm) {
      out.strip_per_pack = parseInt(nxm[1], 10);
      out.pcs_per_strip = parseInt(nxm[2], 10);
    } else {
      const ns = raw.match(/(\d+)\s*'?s\s*pack/i);
      if (ns) {
        out.strip_per_pack = 1;
        out.pcs_per_strip = parseInt(ns[1], 10);
      }
    }
  } else {
    const raw = out.pack_text ?? "";
    // Try volume ml
    const mlM = raw.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
    const gM = raw.match(/(\d+(?:\.\d+)?)\s*(gm|g)\b/i);
    const contM = raw.match(/\b(vial|ampoule|bottle|tube|jar|pot)s?\b/i);
    if (out.format === "liquid" && mlM) {
      out.container_qty = parseFloat(mlM[1]);
      out.container_unit = "ml";
      const container = contM ? contM[1].toLowerCase() : "bottle";
      out.container_text = `${mlM[1]} ml ${container}`;
    } else if (out.format === "semisolid" && gM) {
      out.container_qty = parseFloat(gM[1]);
      out.container_unit = "g";
      const container = contM ? contM[1].toLowerCase() : "tube";
      out.container_text = `${gM[1]} gm ${container}`;
    } else if (out.format === "single") {
      if (mlM && contM) {
        out.container_qty = parseFloat(mlM[1]);
        out.container_unit = "ml";
        out.container_text = `${mlM[1]} ml ${contM[1].toLowerCase()}`;
      } else if (contM) {
        const nM = raw.match(/(\d+)\s*(?:x\s*)?(?:vial|ampoule|bottle|tube)/i);
        const qty = nM ? parseInt(nM[1], 10) : 1;
        out.container_qty = qty;
        out.container_unit = contM[1].toLowerCase() as any;
        out.container_text = `${qty} ${contM[1].toLowerCase()}`;
      } else {
        const nsM = raw.match(/(\d+)\s*'?s\s*pack/i);
        if (nsM) {
          out.container_qty = parseInt(nsM[1], 10);
          out.container_unit = "pcs";
          out.container_text = `${nsM[1]}'s pack`;
        }
      }
    } else {
      // Fallback: use raw pack text if nothing structured
      if (raw) out.container_text = raw;
    }
  }

  if (!out.unit_price) {
    const lone = scope.match(/৳\s*([\d,]+(?:\.\d+)?)/);
    if (lone) out.unit_price = parseFloat(lone[1].replace(/,/g, ""));
  }

  return out;
}

function approxEq(a: number, b: number, tol = 0.02): boolean {
  if (!isFinite(a) || !isFinite(b)) return false;
  if (a === 0 && b === 0) return true;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) <= tol;
}

// ---- Relaxed strength comparison helpers ----
// Canonical strength representation for structured comparison.
interface Strength {
  components: { value: number; unit: string }[]; // e.g. [{5,"mg"},{2,"mg"}]
  denominator: { value: number; unit: string } | null; // e.g. "/5 ml" -> {5,"ml"}
  percents: number[];      // e.g. 2 for "2%"
  iu: number[];            // international units
}

function canonUnit(u: string): string {
  const t = u.toLowerCase();
  if (t === "gm" || t === "g") return "g";
  if (t === "millilitre" || t === "millilitres" || t === "milliliter" || t === "milliliters") return "ml";
  if (t === "µg" || t === "ug") return "mcg";
  return t;
}

function parseStrength(raw: string | null | undefined): Strength {
  const out: Strength = { components: [], denominator: null, percents: [], iu: [] };
  if (!raw) return out;
  let s = raw.toLowerCase().replace(/w\s*\/\s*[wv]/g, " ");
  // percents
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    out.percents.push(parseFloat(m[1]));
  }
  s = s.replace(/\d+(?:\.\d+)?\s*%/g, " ");
  // IU
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*iu\b/g)) {
    out.iu.push(parseFloat(m[1]));
  }
  s = s.replace(/\d+(?:\.\d+)?\s*iu\b/g, " ");
  // denominator: /5 ml, /vial, /puff, /dose, /drop, /spray, /application, /g, /gm
  const denomM = s.match(/\/\s*(\d+(?:\.\d+)?)?\s*(ml|g|gm|vial|puff|dose|drop|spray|application)s?\b/);
  if (denomM) {
    out.denominator = {
      value: denomM[1] ? parseFloat(denomM[1]) : 1,
      unit: canonUnit(denomM[2]),
    };
    s = s.replace(denomM[0], " ");
  }
  // components: number + unit
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|gm|ml)\b/g)) {
    out.components.push({ value: parseFloat(m[1]), unit: canonUnit(m[2]) });
  }
  // Sort components for stable multiset compare
  out.components.sort((a, b) => a.value - b.value || a.unit.localeCompare(b.unit));
  out.percents.sort((a, b) => a - b);
  out.iu.sort((a, b) => a - b);
  return out;
}

function componentsEqual(a: Strength["components"], b: Strength["components"]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].unit !== b[i].unit) return false;
    if (Math.abs(a[i].value - b[i].value) > 1e-6) return false;
  }
  return true;
}

function arraysNearlyEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return false;
  return true;
}

function strengthMatches(db: string | null | undefined, page: string | null | undefined): boolean {
  if (!db || !page) return false;
  const dS = parseStrength(db);
  const pS = parseStrength(page);
  const dEmpty = !dS.components.length && !dS.percents.length && !dS.iu.length;
  const pEmpty = !pS.components.length && !pS.percents.length && !pS.iu.length;
  if (dEmpty && pEmpty) return true;
  // Percent-only forms (creams, ointments)
  if (dS.percents.length && arraysNearlyEqual(dS.percents, pS.percents)) return true;
  // IU
  if (dS.iu.length && arraysNearlyEqual(dS.iu, pS.iu)) return true;
  // Components: multiset equal
  if (dS.components.length && componentsEqual(dS.components, pS.components)) {
    // Denominator compat: null/null OR both equal OR db-null (we were incomplete)
    if (!dS.denominator && !pS.denominator) return true;
    if (!dS.denominator && pS.denominator) return true; // upgrade case
    if (dS.denominator && pS.denominator
        && dS.denominator.unit === pS.denominator.unit
        && Math.abs(dS.denominator.value - pS.denominator.value) < 1e-6) return true;
  }
  return false;
}

function firstStrengthToken(s: string | null | undefined): string | null {
  if (!s) return null;
  // Drop any denominator suffix like "/5 ml", "/vial", "/puff" before extracting the first token.
  const cleaned = s.replace(/\/\s*[^\s,+()]+/g, " ").replace(/[()]/g, " ");
  const m = cleaned.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|gm|iu|%|ml))/i);
  return m ? m[1].trim() : null;
}

type Outcome =
  | "matched"
  | "unmatched_no_candidate"
  | "unmatched_generic_mismatch"
  | "unmatched_strength_mismatch"
  | "math_mismatch"
  | "fetch_failed";

interface ProcessResult {
  outcome: Outcome;
  brandUrl?: string;
  page?: BrandPage;
  reason?: string;
}

async function discoverCandidates(brand: string, strength: string | null): Promise<string[]> {
  const core = brandCoreToken(brand);
  if (!core) return [];
  const queries: string[] = [];
  if (strength && strength.trim()) {
    queries.push(`${brand} ${strength}`);
    const first = firstStrengthToken(strength);
    if (first && first.toLowerCase() !== strength.trim().toLowerCase()) {
      queries.push(`${brand} ${first}`);
    }
  }
  queries.push(brand);
  if (core && core !== brand.toLowerCase().replace(/[^a-z0-9]/g, "")) {
    queries.push(core);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const html = await medexFetch(`https://medex.com.bd/search?search=${encodeURIComponent(q)}`);
    if (!html) continue;
    for (const u of findBrandUrls(html)) {
      if (seen.has(u)) continue;
      if (!slugCore(u).startsWith(core)) continue;
      seen.add(u);
      out.push(u);
      if (out.length >= 8) return out;
    }
    if (out.length) return out;
  }
  return out;
}

async function processOne(row: {
  id: string;
  brand_name: string;
  company: string | null;
  strength: string | null;
  generic_name: string | null;
}): Promise<ProcessResult> {
  const candidates = await discoverCandidates(row.brand_name, row.strength);
  if (!candidates.length) return { outcome: "unmatched_no_candidate" };

  const core = brandCoreToken(row.brand_name);
  const wantStrength = norm(row.strength);
  const wantGeneric = genericTokens(row.generic_name);

  let lastReason: Outcome = "unmatched_no_candidate";
  let lastPage: BrandPage | undefined;
  let lastUrl: string | undefined;

  for (const url of candidates) {
    const html = await medexFetch(url);
    if (!html) { lastReason = "fetch_failed"; continue; }
    const page = parseBrandPage(html);
    lastPage = page; lastUrl = url;

    // Brand check
    if (!norm(page.brand_title).startsWith(core) && !norm(page.brand_title).includes(core)) {
      lastReason = "unmatched_no_candidate"; continue;
    }

    // Generic check (subset)
    if (wantGeneric.size > 0) {
      const pageGen = genericTokens(page.generic_text);
      let ok = true;
      for (const t of wantGeneric) if (!pageGen.has(t)) { ok = false; break; }
      if (!ok) { lastReason = "unmatched_generic_mismatch"; continue; }
    }

    // Strength check (only if DB has one) — relaxed comparator
    if (wantStrength) {
      if (!page.strength_text || !strengthMatches(row.strength, page.strength_text)) {
        lastReason = "unmatched_strength_mismatch"; continue;
      }
    }

    // Math cross-check (only if we have enough numbers)
    if (page.format === "strip") {
      if (page.unit_price != null && page.pcs_per_strip != null && page.strip_price != null) {
        if (!approxEq(page.unit_price * page.pcs_per_strip, page.strip_price)) {
          lastReason = "math_mismatch"; continue;
        }
      }
      if (page.strip_price != null && page.strip_per_pack != null && page.pack_total != null) {
        if (!approxEq(page.strip_price * page.strip_per_pack, page.pack_total)) {
          lastReason = "math_mismatch"; continue;
        }
      }
    } else {
      // Non-strip: require a container description; skip math entirely.
      if (!page.container_text) {
        lastReason = "unmatched_no_candidate"; continue;
      }
    }

    return { outcome: "matched", brandUrl: url, page };
  }

  return { outcome: lastReason, brandUrl: lastUrl, page: lastPage };
}

function authorized(req: Request): boolean {
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET && provided === CRON_SECRET) return true;
  const apikey = req.headers.get("apikey") ?? "";
  if (SERVICE_KEY && apikey === SERVICE_KEY) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "15", 10), 100);
  let offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const dry = (url.searchParams.get("dry") ?? "1") !== "0";
  const delayMs = Math.max(0, parseInt(url.searchParams.get("delay") ?? "2400", 10));
  const auto = url.searchParams.get("auto") === "1";
  // Retry-by-status mode: e.g. retry_statuses=unmatched_strength_mismatch,unmatched_generic_mismatch
  const retryStatusesParam = url.searchParams.get("retry_statuses");
  const retryStatuses = retryStatusesParam
    ? retryStatusesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  if (auto && !retryStatuses) {
    const { data: prog } = await sb
      .from("spider_sync_progress")
      .select("next_offset, total_rows, finished_at")
      .eq("id", 1)
      .maybeSingle();
    if (!prog) {
      return new Response(JSON.stringify({ error: "no_progress_row" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (prog.finished_at || prog.next_offset >= prog.total_rows) {
      return new Response(JSON.stringify({ done: true, offset: prog.next_offset, total: prog.total_rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    offset = prog.next_offset;
  }

  let rows: any[] | null = null;
  let selErr: any = null;
  if (retryStatuses && retryStatuses.length) {
    const res = await sb
      .from("master_medicines")
      .select("id, brand_name, company, strength, generic_name, pack_size, unit_price, pcs_per_strip, strip_per_pack, medex_attempts")
      .in("medex_status", retryStatuses)
      .order("medex_last_attempt_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .limit(limit);
    rows = res.data; selErr = res.error;
  } else {
    const res = await sb
      .from("master_medicines")
      .select("id, brand_name, company, strength, generic_name, pack_size, unit_price, pcs_per_strip, strip_per_pack, medex_attempts")
      .order("brand_name", { ascending: true })
      .range(offset, offset + limit - 1);
    rows = res.data; selErr = res.error;
  }

  if (selErr || !rows) {
    return new Response(JSON.stringify({ error: selErr?.message ?? "select_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const outcomes: Record<string, number> = {};
  const samples: any[] = [];
  let updatedMaster = 0;
  let updatedMedicines = 0;
  let matched = 0;
  let unmatched = 0;

  for (const r of rows) {
    const res = await processOne(r as any);
    outcomes[res.outcome] = (outcomes[res.outcome] ?? 0) + 1;

    if (res.outcome === "matched" && res.page) {
      matched++;
      const p = res.page;
      // Upgrade strength when we were incomplete (db has no denominator but page does),
      // or when db strength is missing entirely.
      let upgradedStrength: string | null = null;
      const dbS = parseStrength(r.strength);
      const pgS = parseStrength(p.strength_text);
      if (
        p.strength_text && (
          !r.strength ||
          (!dbS.denominator && pgS.denominator) ||
          (dbS.components.length === 0 && pgS.components.length > 0)
        )
      ) {
        upgradedStrength = p.strength_text;
      }
      let after: Record<string, any>;
      if (p.format === "strip") {
        const packSizeText = p.strip_per_pack != null && p.pcs_per_strip != null
          ? `${p.strip_per_pack} x ${p.pcs_per_strip}`
          : (p.pack_text ?? r.pack_size);
        after = {
          unit_price: p.unit_price ?? r.unit_price,
          pcs_per_strip: p.pcs_per_strip,
          strip_per_pack: p.strip_per_pack,
          pack_size: packSizeText,
          medex_verified_at: new Date().toISOString(),
          medex_last_attempt_at: new Date().toISOString(),
          medex_attempts: (r.medex_attempts ?? 0) + 1,
          medex_confidence: "high",
          medex_url: res.brandUrl ?? null,
          medex_status: "matched",
        };
      } else {
        // Liquid / semisolid / single — native format, no math.
        const absolutePrice = p.unit_price ?? p.strip_price ?? p.pack_total ?? r.unit_price;
        after = {
          unit_price: absolutePrice,
          pcs_per_strip: 1,
          strip_per_pack: 1,
          pack_size: p.container_text ?? p.pack_text ?? r.pack_size,
          medex_verified_at: new Date().toISOString(),
          medex_last_attempt_at: new Date().toISOString(),
          medex_attempts: (r.medex_attempts ?? 0) + 1,
          medex_confidence: "high",
          medex_url: res.brandUrl ?? null,
          medex_status: "matched",
        };
      }
      if (!r.generic_name && p.generic_text) after.generic_name = p.generic_text;
      if (upgradedStrength) after.strength = upgradedStrength;

      if (samples.length < 5) {
        samples.push({
          id: r.id, brand: r.brand_name, strength: r.strength, format: p.format,
          url: res.brandUrl,
          before: { unit_price: r.unit_price, pcs_per_strip: r.pcs_per_strip, strip_per_pack: r.strip_per_pack, pack_size: r.pack_size },
          after,
        });
      }

      if (!dry) {
        const { error: upErr } = await sb.from("master_medicines").update(after).eq("id", r.id);
        if (!upErr) updatedMaster++;
        const { data: medRows } = await sb
          .from("medicines")
          .update({
            pcs_per_strip: after.pcs_per_strip,
            strip_per_pack: after.strip_per_pack,
            pack_size: after.pack_size,
            price: after.unit_price,
          })
          .eq("name", r.brand_name)
          .eq("company_name", r.company ?? "")
          .select("id");
        updatedMedicines += medRows?.length ?? 0;
      }
    } else {
      unmatched++;
      if (!dry) {
        await sb
          .from("master_medicines")
          .update({
            medex_status: res.outcome,
            medex_verified_at: new Date().toISOString(),
            medex_last_attempt_at: new Date().toISOString(),
            medex_attempts: (r.medex_attempts ?? 0) + 1,
            medex_confidence: "none",
          })
          .eq("id", r.id);
      }
    }

    if (delayMs > 0) await new Promise((rs) => setTimeout(rs, delayMs));
  }

  if (auto && !dry && !retryStatuses) {
    const newOffset = offset + rows.length;
    const { data: prog } = await sb
      .from("spider_sync_progress")
      .select("matched_total, unmatched_total, total_rows")
      .eq("id", 1)
      .maybeSingle();
    const totalRows = prog?.total_rows ?? 0;
    await sb
      .from("spider_sync_progress")
      .update({
        next_offset: newOffset,
        matched_total: (prog?.matched_total ?? 0) + matched,
        unmatched_total: (prog?.unmatched_total ?? 0) + unmatched,
        last_run_at: new Date().toISOString(),
        finished_at: newOffset >= totalRows ? new Date().toISOString() : null,
      })
      .eq("id", 1);
  }

  return new Response(
    JSON.stringify({
      dry, offset, scanned: rows.length, matched, unmatched,
      outcomes, updated_master: updatedMaster, updated_medicines: updatedMedicines,
      samples,
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});