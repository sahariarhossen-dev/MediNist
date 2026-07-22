// Pure MedEx catalog scraper.
// Fetches one brands index page per invocation, scrapes each brand detail page,
// and upserts a clean row into public.master_medicines. No matching, no retry
// logic against local pharmacy inventory.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BASE = "https://medex.com.bd";
const UA = "Mozilla/5.0 (compatible; MediNistScraper/1.0)";
const DETAIL_DELAY_MS = 1500;

function textDecode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function extractBrandLinks(indexHtml: string): string[] {
  const set = new Set<string>();
  const re = /href="(https:\/\/medex\.com\.bd\/brands\/\d+\/[a-z0-9-]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexHtml)) !== null) set.add(m[1]);
  return [...set];
}

interface Parsed {
  medex_url: string;
  brand_name: string;
  generic_name: string | null;
  company: string | null;
  format: string | null;
  strength: string | null;
  unit_price: number | null;
  pack_size: string | null;
  box_size: string | null;
  pcs_per_strip: number | null;
  strip_per_pack: number | null;
}

function parseBrandPage(url: string, html: string): Parsed | null {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch) return null;
  const title = textDecode(titleMatch[1]);
  const parts = title.split("|").map((p) => p.trim());
  // Expected: Brand | Strength | Type | (bn) | Manufacturer | ...
  const brand_name = parts[0] || "";
  const strength = parts[1] || null;
  const format = parts[2] || null;
  const company = parts[4] || null;
  if (!brand_name) return null;

  // Generic — first /generics/{id}/{slug} link, text content
  let generic_name: string | null = null;
  const genRe = /<a[^>]+href="https:\/\/medex\.com\.bd\/generics\/\d+\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i;
  const gm = genRe.exec(html);
  if (gm) generic_name = textDecode(gm[1].replace(/<[^>]+>/g, ""));

  // Pricing / pack info
  let unit_price: number | null = null;
  let pack_size: string | null = null;
  let box_size: string | null = null;
  let pcs_per_strip: number | null = null;
  let strip_per_pack: number | null = null;

  const packBlockMatch = html.match(/package-container[\s\S]*?<\/div>\s*<\/div>/i);
  const packBlock = packBlockMatch ? packBlockMatch[0] : "";

  const unitPriceMatch = packBlock.match(/Unit Price:[\s\S]*?৳\s*([\d.,]+)/i);
  if (unitPriceMatch) unit_price = parseFloat(unitPriceMatch[1].replace(/,/g, ""));

  // e.g. (6 x 10: ৳ 720.00)  or  (100 ml bottle: ৳ 50.00)  or  (1 vial: ৳ 200.00)
  const packInfo = packBlock.match(/pack-size-info[^>]*>\s*\(([^)]+)\)/i);
  if (packInfo) {
    const raw = textDecode(packInfo[1]);
    // split "6 x 10: ৳ 720.00"
    const [left, right] = raw.split(":").map((s) => s.trim());
    pack_size = left || null;
    if (right) {
      const bm = right.match(/([\d.,]+)/);
      if (bm) box_size = bm[1].replace(/,/g, "");
    }
    const nxm = left && left.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (nxm) {
      strip_per_pack = parseInt(nxm[1], 10);
      pcs_per_strip = parseInt(nxm[2], 10);
    }
  }

  // Non-strip formats default to 1 x 1
  const fmt = (format || "").toLowerCase();
  const isSingle = /(syrup|suspension|injection|infusion|drop|inhaler|cream|ointment|gel|lotion|solution|spray|powder|shampoo|oil|liquid|nebul)/i
    .test(fmt);
  if (isSingle && pcs_per_strip == null && strip_per_pack == null) {
    pcs_per_strip = 1;
    strip_per_pack = 1;
  }

  return {
    medex_url: url,
    brand_name,
    generic_name,
    company,
    format,
    strength,
    unit_price,
    pack_size,
    box_size,
    pcs_per_strip,
    strip_per_pack,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Endpoint only writes public MedEx catalog data; no secret gate needed.
    const url = new URL(req.url);
    const forcePage = url.searchParams.get("page");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: progress } = await supabase
      .from("medex_scrape_progress")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    const page = forcePage ? parseInt(forcePage, 10) : progress?.next_page ?? 1;

    const indexHtml = await fetchHtml(`${BASE}/brands?page=${page}`);
    const links = extractBrandLinks(indexHtml);

    if (links.length === 0) {
      await supabase.from("medex_scrape_progress").update({
        finished: true,
        last_run_at: new Date().toISOString(),
        last_status: `page ${page} empty — sweep complete`,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      return new Response(
        JSON.stringify({ ok: true, page, links: 0, finished: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rows: Parsed[] = [];
    const errors: string[] = [];
    for (const link of links) {
      try {
        const html = await fetchHtml(link);
        const parsed = parseBrandPage(link, html);
        if (parsed) rows.push(parsed);
      } catch (e) {
        errors.push(`${link}: ${(e as Error).message}`);
      }
      await sleep(DETAIL_DELAY_MS);
    }

    let inserted = 0;
    if (rows.length) {
      const { error } = await supabase
        .from("master_medicines")
        .upsert(rows, { onConflict: "medex_url" });
      if (error) throw error;
      inserted = rows.length;
    }

    await supabase.from("medex_scrape_progress").update({
      next_page: (forcePage ? (progress?.next_page ?? 1) : page + 1),
      total_scraped: (progress?.total_scraped ?? 0) + inserted,
      last_run_at: new Date().toISOString(),
      last_status: `page ${page}: ${inserted}/${links.length} scraped${errors.length ? `, ${errors.length} errors` : ""}`,
      last_error: errors.slice(0, 3).join(" | ") || null,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);

    return new Response(
      JSON.stringify({ ok: true, page, links: links.length, inserted, errors: errors.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("medex-scraper error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});