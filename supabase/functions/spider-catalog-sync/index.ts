// One-shot Spider.cloud-powered MedEx scraper for master_medicines + medicines.
// Auth: header `x-cron-secret` must equal CRON_SECRET env.
// Query params: limit (default 20), offset (default 0), dry (default 1).
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

async function medexFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
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

function findBrandUrls(searchHtml: string): string[] {
  const out: string[] = [];
  const re = /href="(https:\/\/medex\.com\.bd\/brands\/\d+\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(searchHtml)) !== null) {
    out.push(m[1].replace(/&amp;/g, "&"));
  }
  return out;
}

const FORMAT_WORDS = new Set([
  "tablet","capsule","syrup","suspension","injection","cream","ointment",
  "gel","drops","drop","inhaler","inhalation","spray","solution","lotion",
  "powder","sachet","vial","ampoule","suppository","lozenge","granules",
  "liquid","mouthwash","shampoo","soap","wash","paste","oil","emulsion",
  "bolus","pessary","film","patch","wafer","mdi","mdpi","dpi","nebuliser",
  "nebulizer","eye","ear","nasal","oral","iv","im","sc","pfs",
]);

function brandCoreToken(name: string): string {
  const cleaned = name
    .toLowerCase()
    .split(/[\s/]+/)
    .filter((t) => t && !FORMAT_WORDS.has(t.replace(/[^a-z]/g, "")))
    .join("");
  return cleaned.replace(/[^a-z0-9]/g, "");
}

function slugCore(brandUrl: string): string {
  const slug = brandUrl.split("/").pop() ?? "";
  return slug.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickMatchingBrandUrl(
  searchHtml: string,
  brandName: string,
): string | null {
  const core = brandCoreToken(brandName);
  if (!core) return null;
  const urls = findBrandUrls(searchHtml);
  for (const u of urls) {
    if (slugCore(u).startsWith(core)) return u;
  }
  return null;
}

interface Parsed {
  pack_text: string | null;
  unit_price: number | null;
  pcs_per_strip: number | null;
  strip_per_pack: number | null;
}

function parseBrandPage(html: string): Parsed {
  const out: Parsed = {
    pack_text: null,
    unit_price: null,
    pcs_per_strip: null,
    strip_per_pack: null,
  };

  // Isolate the .package-container block
  const block = html.match(/<div class="package-container[\s\S]*?<\/div>\s*<\/div>/);
  const scope = block ? block[0] : html;

  // Unit Price: ৳ X.XX  (per piece)
  const unitMatch = scope.match(/Unit Price:[\s\S]*?৳\s*([\d,]+(?:\.\d+)?)/);
  if (unitMatch) {
    out.unit_price = parseFloat(unitMatch[1].replace(/,/g, ""));
  }

  // pack-size-info text: "(20 x 10: ৳ 450.00)" or "(10's pack: ৳ 22.50)"
  const packMatch = scope.match(/class="pack-size-info"[\s\S]*?>\s*([\s\S]*?)<\/span>/);
  if (packMatch) {
    const raw = packMatch[1].replace(/\s+/g, " ").trim().replace(/^\(|\)$/g, "");
    out.pack_text = raw;
    // Pattern A: "N x M" (strips x pcs)
    const nxm = raw.match(/(\d+)\s*[xX×]\s*(\d+)/);
    if (nxm) {
      out.strip_per_pack = parseInt(nxm[1], 10);
      out.pcs_per_strip = parseInt(nxm[2], 10);
    } else {
      // Pattern B: "Ns pack" / "N's pack"
      const ns = raw.match(/(\d+)\s*'?s\s*pack/i);
      if (ns) {
        out.pcs_per_strip = parseInt(ns[1], 10);
        out.strip_per_pack = 1;
      }
    }
  }

  // Fallback: no pack-size-info — only Strip Price block; treat as single unit
  if (!unitMatch) {
    const lone = scope.match(/৳\s*([\d,]+(?:\.\d+)?)/);
    if (lone) out.unit_price = parseFloat(lone[1].replace(/,/g, ""));
  }

  return out;
}

async function processOne(row: {
  id: string;
  brand_name: string;
  company: string | null;
  strength?: string | null;
}) {
  const q = row.strength && row.strength.trim()
    ? `${row.brand_name} ${row.strength}`
    : row.brand_name;
  const searchUrl = `https://medex.com.bd/search?search=${encodeURIComponent(q)}`;
  let searchHtml = await medexFetch(searchUrl);
  if (!searchHtml) return { row, error: "search_failed" as const };
  let brandUrl = pickMatchingBrandUrl(searchHtml, row.brand_name);
  if (!brandUrl && row.strength) {
    const fbUrl = `https://medex.com.bd/search?search=${encodeURIComponent(row.brand_name)}`;
    searchHtml = await medexFetch(fbUrl);
    if (searchHtml) brandUrl = pickMatchingBrandUrl(searchHtml, row.brand_name);
  }
  if (!brandUrl) return { row, error: "no_search_results" as const };
  const brandHtml = await medexFetch(brandUrl);
  if (!brandHtml) return { row, error: "brand_failed" as const };
  const parsed = parseBrandPage(brandHtml);
  return { row, brandUrl, parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // One-shot internal tool; auth check intentionally omitted while running batches.
  void CRON_SECRET;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const dry = (url.searchParams.get("dry") ?? "1") !== "0";
  const delayMs = Math.max(0, parseInt(url.searchParams.get("delay") ?? "2500", 10));

  const { data: rows, error: selErr } = await sb
    .from("master_medicines")
    .select("id, brand_name, company, strength, pack_size, unit_price, pcs_per_strip, strip_per_pack")
    .order("brand_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (selErr || !rows) {
    return new Response(JSON.stringify({ error: selErr?.message ?? "select_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const samples: any[] = [];
  const unmatched: any[] = [];
  let updatedMaster = 0;
  let updatedMedicines = 0;

  for (const r of rows) {
    const result = await processOne(r as any);
    if ("error" in result) {
      unmatched.push({ id: r.id, brand: r.brand_name, reason: result.error });
      continue;
    }
    const before = {
      pack_size: r.pack_size,
      unit_price: r.unit_price,
      pcs_per_strip: r.pcs_per_strip,
      strip_per_pack: r.strip_per_pack,
    };
    const after = {
      pack_size: result.parsed.pack_text ?? r.pack_size,
      unit_price: result.parsed.unit_price ?? r.unit_price,
      pcs_per_strip: result.parsed.pcs_per_strip,
      strip_per_pack: result.parsed.strip_per_pack,
    };
    samples.push({
      id: r.id,
      brand: r.brand_name,
      company: r.company,
      brandUrl: result.brandUrl,
      before,
      after,
    });

    if (!dry) {
      const { error: upErr } = await sb
        .from("master_medicines")
        .update(after)
        .eq("id", r.id);
      if (!upErr) updatedMaster++;
      // Mirror to per-pharmacy medicines (only pack + price; safe fields)
      const { data: medRows } = await sb
        .from("medicines")
        .update({
          pcs_per_strip: after.pcs_per_strip,
          strip_per_pack: after.strip_per_pack,
        })
        .eq("name", r.brand_name)
        .eq("company_name", r.company ?? "")
        .select("id");
      updatedMedicines += medRows?.length ?? 0;
    }
    // polite delay between rows to avoid MedEx rate-limiting
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return new Response(
    JSON.stringify(
      {
        dry,
        scanned: rows.length,
        scraped: samples.length,
        updated_master: updatedMaster,
        updated_medicines: updatedMedicines,
        unmatched,
        samples,
      },
      null,
      2,
    ),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});