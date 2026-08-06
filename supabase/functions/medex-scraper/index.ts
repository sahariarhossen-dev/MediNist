// Pure MedEx catalog scraper.
// Fetches one brands index page per invocation, scrapes each brand detail page,
// and upserts a clean row into public.master_medicines. No matching, no retry
// logic against local pharmacy inventory.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BASE = "https://medex.com.bd";
const UA = "Mozilla/5.0 (compatible; MediNistScraper/1.0)";
const DETAIL_DELAY_MS = 800;
const MAX_LINKS_PER_RUN = 15;

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
  // MedEx title variations:
  //   Brand | Strength | Type | [Bengali] | Manufacturer | Indications... | MedEx
  //   Brand | Type | Manufacturer | Indications... | MedEx           (no strength)
  //   Brand | Strength | Type | Manufacturer | Indications... | MedEx (no bengali)
  // Strategy: drop the trailing "Indications..." + "MedEx" segments and any
  // Bengali-script segments, then assign by position from the tail so the
  // manufacturer never lands in the format column.
  const FORMAT_WORDS = /^(tablet|capsule|syrup|suspension|injection|infusion|drop|drops|inhaler|inhalation|cream|ointment|gel|lotion|solution|spray|powder|shampoo|oil|liquid|nebuliser solution|nebulizer solution|nasal spray|eye drop|ear drop|pediatric drops|iv infusion|iv injection|im\/iv injection|sachet|suppository|pessary|vaginal|granules|effervescent|lozenge|paste|patch|mouthwash|enema)\b/i;
  const hasBengali = (s: string) => /[\u0980-\u09FF]/.test(s);
  const rawParts = title.split("|").map((p) => p.trim()).filter(Boolean);
  const parts = rawParts.filter((p) =>
    !hasBengali(p) &&
    !/^MedEx$/i.test(p) &&
    !/^Indications\b/i.test(p)
  );
  const brand_name = parts[0] || "";
  if (!brand_name) return null;
  // Manufacturer is the last remaining segment.
  const company = parts.length >= 2 ? parts[parts.length - 1] : null;
  // Format is the last segment that looks like a dosage form.
  let format: string | null = null;
  for (let i = parts.length - 2; i >= 1; i--) {
    if (FORMAT_WORDS.test(parts[i])) { format = parts[i]; break; }
  }
  // Strength = middle segment(s) that are neither brand, format, nor company.
  const middle = parts.slice(1, parts.length - 1).filter((p) => p !== format);
  const strength = middle.length ? middle.join(" | ") : null;

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
    const startIdxParam = url.searchParams.get("start");
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

    // Idle mode: once a sweep is finished, do nothing until the nightly reset
    // cron reopens a refresh cycle (finished = false). An explicit ?page=
    // override still forces a run for manual checks.
    if (!forcePage && progress?.finished) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "sweep finished — waiting for next daily refresh cycle", next_page: page }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cursorOffset = startIdxParam
      ? parseInt(startIdxParam, 10)
      : (forcePage ? 0 : (progress?.page_offset ?? 0));

    const indexHtml = await fetchHtml(`${BASE}/brands?page=${page}`);
    const allLinks = extractBrandLinks(indexHtml);
    const startIdx = cursorOffset;
    const links = allLinks.slice(startIdx, startIdx + MAX_LINKS_PER_RUN);

    if (allLinks.length === 0) {
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

    // Advance cursor: if we consumed the tail of this page, move to next page; otherwise stay on the same page and continue from the next slice on the next run.
    const consumedEnd = startIdx + links.length;
    const pageDone = consumedEnd >= allLinks.length;
    const nextPage = forcePage
      ? (progress?.next_page ?? 1)
      : pageDone ? page + 1 : page;
    const nextOffset = pageDone ? 0 : consumedEnd;
    await supabase.from("medex_scrape_progress").update({
      next_page: nextPage,
      page_offset: nextOffset,
      total_scraped: (progress?.total_scraped ?? 0) + inserted,
      last_run_at: new Date().toISOString(),
      last_status: `page ${page} [${startIdx}-${consumedEnd}/${allLinks.length}]: ${inserted} scraped${errors.length ? `, ${errors.length} errors` : ""}`,
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