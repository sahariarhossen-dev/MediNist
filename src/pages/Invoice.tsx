import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { X, Download, FileText, Share2, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { formatMoney } from "@/lib/formatUtils";
import { toast } from "sonner";

interface SaleData {
  id: string;
  total: number;
  subtotal: number;
  discount_amount: number;
  discount_percent: number;
  created_at: string;
  status: string;
  sale_type: string;
  pharmacy_id: string;
  user_id: string;
}

interface SaleItemData {
  id: string;
  medicine_name: string;
  company_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  discount_percent: number;
}

interface PharmacyData {
  name: string;
  address: string | null;
  division: string | null;
  district: string | null;
  upazila: string | null;
  email: string | null;
  proprietor_name: string | null;
}

const Invoice = () => {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [sale, setSale] = useState<SaleData | null>(null);
  const [items, setItems] = useState<SaleItemData[]>([]);
  const [pharmacy, setPharmacy] = useState<PharmacyData | null>(null);
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cachedPdfBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (!saleId) return;
    const load = async () => {
      setLoading(true);
      const { data: saleData } = await supabase
        .from("sales")
        .select("*")
        .eq("id", saleId)
        .single();

      if (!saleData) { setLoading(false); return; }
      setSale(saleData as SaleData);

      const [itemsRes, pharmacyRes, sellerRes] = await Promise.all([
        supabase.from("sale_items").select("id, medicine_name, company_name, quantity, unit_price, total_price, discount_percent").eq("sale_id", saleId),
        supabase.from("pharmacies").select("name, address, division, district, upazila, email, proprietor_name").eq("id", saleData.pharmacy_id).single(),
        supabase.from("profiles").select("full_name, phone").eq("id", saleData.user_id).single(),
      ]);

      setItems((itemsRes.data as SaleItemData[]) || []);
      setPharmacy(pharmacyRes.data as PharmacyData | null);
      setSellerName(sellerRes.data?.full_name || "Staff");
      setSellerPhone(sellerRes.data?.phone || "");
      setLoading(false);
    };
    load();
  }, [saleId]);

  const handleDownloadPDF = async () => {
    const element = document.getElementById("invoice-content");
    if (!element) return;
    setDownloading(true);
    // Save inline style so we can restore after capture
    const originalWidth = element.style.width;
    const originalMaxWidth = element.style.maxWidth;
    try {
      // Force the invoice to render at A4 width (~210mm @ 96dpi = 794px)
      // regardless of the current viewport so html2canvas captures the
      // desktop-style layout instead of the narrow mobile reflow.
      const A4_PX = 794;
      element.style.width = `${A4_PX}px`;
      element.style.maxWidth = `${A4_PX}px`;
      // Let the browser reflow at the new width before we snapshot.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 50));

      const A4_W = 210; // mm
      const A4_H = 297; // mm
      const MARGIN = 10; // mm
      const CONTENT_W = A4_W - MARGIN * 2; // 190mm
      const PAGE_CONTENT_H = A4_H - MARGIN * 2; // 277mm
      const GAP = 3; // mm between sections

      const pdf = new jsPDF("p", "mm", "a4");
      let cursorY = MARGIN;

      const sections = Array.from(
        element.querySelectorAll<HTMLElement>("[data-pdf-section]")
      );
      // Fallback: if no sections marked, treat the whole element as one section.
      const targets = sections.length > 0 ? sections : [element];

      for (const section of targets) {
        const canvas = await html2canvas(section, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: A4_PX,
        });
        const hMM = (canvas.height * CONTENT_W) / canvas.width;
        const imgData = canvas.toDataURL("image/png");

        if (hMM <= PAGE_CONTENT_H) {
          // Whole section fits on a page — add a new page if it doesn't fit
          // in the remaining space on the current one.
          if (cursorY + hMM > A4_H - MARGIN && cursorY > MARGIN) {
            pdf.addPage();
            cursorY = MARGIN;
          }
          pdf.addImage(imgData, "PNG", MARGIN, cursorY, CONTENT_W, hMM);
          cursorY += hMM + GAP;
        } else {
          // Section is taller than a full page (e.g. very long item table).
          // Start it on a fresh page and slice the canvas across pages.
          if (cursorY > MARGIN) {
            pdf.addPage();
            cursorY = MARGIN;
          }
          // pixels per mm based on the rendered canvas
          const pxPerMM = canvas.width / CONTENT_W;
          const sliceHeightPx = Math.floor(PAGE_CONTENT_H * pxPerMM);
          let offsetPx = 0;
          while (offsetPx < canvas.height) {
            const remainingPx = canvas.height - offsetPx;
            const thisSlicePx = Math.min(sliceHeightPx, remainingPx);
            const sliceCanvas = document.createElement("canvas");
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = thisSlicePx;
            const ctx = sliceCanvas.getContext("2d");
            if (!ctx) break;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            ctx.drawImage(
              canvas,
              0,
              offsetPx,
              canvas.width,
              thisSlicePx,
              0,
              0,
              canvas.width,
              thisSlicePx
            );
            const sliceData = sliceCanvas.toDataURL("image/png");
            const sliceMM = (thisSlicePx * CONTENT_W) / canvas.width;
            pdf.addImage(sliceData, "PNG", MARGIN, MARGIN, CONTENT_W, sliceMM);
            offsetPx += thisSlicePx;
            if (offsetPx < canvas.height) {
              pdf.addPage();
            } else {
              cursorY = MARGIN + sliceMM + GAP;
            }
          }
        }
      }

      const pdfBlob = pdf.output("blob");
      cachedPdfBlobRef.current = pdfBlob;
      pdf.save(`${invoiceId}.pdf`);
    } catch (e) {
      console.error("PDF generation failed", e);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      // Restore original layout so the on-screen preview snaps back.
      element.style.width = originalWidth;
      element.style.maxWidth = originalMaxWidth;
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!sale) return;
    setSharing(true);
    const invoiceUrl = window.location.href;
    const shareTitle = `Invoice ${invoiceId}`;
    const pharmacyName = pharmacy?.name || "MediNist";
    const shareText = `Invoice #${invoiceId} from ${pharmacyName} · ৳${formatMoney(sale.total)}`;

    // 1. Try native Web Share API (mobile devices & supported browsers)
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        // If we already have a generated PDF blob and the device supports sharing files
        if (cachedPdfBlobRef.current && navigator.canShare) {
          try {
            const pdfFile = new File(
              [cachedPdfBlobRef.current],
              `${invoiceId}.pdf`,
              { type: "application/pdf" }
            );
            if (navigator.canShare({ files: [pdfFile] })) {
              await navigator.share({
                files: [pdfFile],
                title: shareTitle,
                text: shareText,
              });
              setSharing(false);
              return;
            }
          } catch (fileShareErr) {
            console.warn("File sharing not permitted, falling back to link sharing", fileShareErr);
          }
        }

        // Native share with invoice link (WhatsApp, Telegram, Messenger, etc.)
        await navigator.share({
          title: shareTitle,
          text: `${shareText}\nView invoice:`,
          url: invoiceUrl,
        });
        setSharing(false);
        return;
      } catch (err: any) {
        setSharing(false);
        // User closed or dismissed the native share sheet without picking an app
        if (err?.name === "AbortError") {
          return;
        }
        console.warn("navigator.share encountered an issue, falling back to clipboard", err);
      }
    }

    // 2. Fallback: Copy invoice link to clipboard
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(invoiceUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = invoiceUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      toast.success("Invoice link copied to clipboard!");
    } catch (copyErr) {
      console.error("Clipboard copy failed", copyErr);
      toast.error("Could not copy link to clipboard");
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-red-700 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Invoice not found</p>
        <button onClick={() => navigate("/sales")} className="text-red-700 font-semibold">Back to Sales</button>
      </div>
    );
  }

  const invoiceId = `INV-${sale.id.slice(0, 11)}`;
  const isWholesale = sale.sale_type === "wholesale";
  const dateObj = parseISO(sale.created_at);
  const timeStr = format(dateObj, "HH:mm");
  const dateStr = format(dateObj, "dd-MM-yy");
  const subtotalLessDiscount = Number(sale.subtotal) - Number(sale.discount_amount);

  const areaDistrict = [pharmacy?.upazila, pharmacy?.district].filter(Boolean).join(" - ");

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Top bar */}
      <div className="no-print sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-gray-200 py-2.5 px-4 shadow-xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          {/* Close button */}
          <button
            id="invoice-close-btn"
            type="button"
            onClick={() => navigate("/sales")}
            className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 active:scale-95 transition text-xs sm:text-sm font-medium py-1.5 px-2 rounded-lg hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Share button */}
            <button
              id="invoice-share-btn"
              type="button"
              onClick={handleShare}
              disabled={sharing}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 active:scale-95 transition text-xs sm:text-sm font-medium shadow-xs disabled:opacity-50"
              title="Share invoice"
              aria-label="Share invoice"
            >
              <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
              <span>Share</span>
            </button>

            {/* Compact Download PDF button */}
            <button
              id="invoice-download-btn"
              type="button"
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="inline-flex items-center justify-center gap-1.5 bg-red-700 text-white px-3 sm:px-3.5 py-1.5 rounded-lg font-medium hover:bg-red-800 active:scale-95 transition text-xs sm:text-sm disabled:opacity-50 shadow-xs"
              title="Download PDF"
              aria-label="Download PDF"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Download PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Invoice content */}
      <div id="invoice-content" className="max-w-3xl mx-auto bg-white rounded-lg shadow-lg print:shadow-none print:rounded-none my-4 print:my-0 p-8 print:p-6">
        
        {/* Two-column header with vertical divider */}
        <div data-pdf-section="header" className="flex items-center mb-1">
          {/* Left — Shop Profile (6 rows) */}
          <div className="flex-1 flex flex-col leading-7">
            <h1 className="text-lg font-extrabold text-gray-900 tracking-tight whitespace-nowrap truncate">{pharmacy?.name || "Pharmacy"}</h1>
            <p className="text-gray-600 text-xs">Pro- {pharmacy?.proprietor_name || "N/A"}</p>
            <p className="text-gray-600 text-xs">Mob-{sellerPhone || profile?.phone || "N/A"}</p>
            <p className="text-gray-600 text-xs">{pharmacy?.address || "N/A"}</p>
            
            <p className="text-gray-600 text-xs">Email- {pharmacy?.email || "N/A"}</p>
          </div>

          {/* Middle Vertical Divider */}
          <div className="self-center h-[60%] min-h-[90px] border-r border-gray-300 mx-6" />

          {/* Right — Invoice Details (6 rows, right-aligned) */}
          <div className="flex-1 flex flex-col leading-7 text-right">
            <div className="flex items-center justify-end gap-2">
              <FileText className="text-red-700 w-5 h-5" />
              <h2 className="text-xl font-extrabold text-red-700 tracking-tight uppercase">Invoice</h2>
            </div>
            <p className="text-xs text-gray-500">Transaction Confirm By</p>
            <p className="font-semibold text-gray-700 text-xs capitalize">{sale.sale_type}</p>
            <p className="font-semibold text-gray-700 text-xs">{sellerName}</p>
            <p className="font-semibold text-gray-700 text-xs">{invoiceId}</p>
            <p className="text-gray-600 text-xs">Dkh-{timeStr}/{dateStr}</p>
          </div>
        </div>

        {/* Red divider */}
        <div data-pdf-section="divider" className="h-[3px] bg-red-700 mb-6 py-0 my-[15px]" />

        {/* Items table */}
        <div data-pdf-section="items" className="overflow-x-auto mb-6">
          <table className="w-full text-sm pdf-table">
            <thead>
              <tr className="bg-red-700 text-white">
                <th className="text-left py-3 px-4 font-semibold uppercase tracking-wide text-xs">#</th>
                <th className="text-left py-3 px-4 font-semibold uppercase tracking-wide text-xs">Description</th>
                <th className="text-center py-3 px-4 font-semibold uppercase tracking-wide text-xs">Qty</th>
                <th className="text-right py-3 px-4 font-semibold uppercase tracking-wide text-xs">Unit Price</th>
                {isWholesale && <th className="text-center py-3 px-4 font-semibold uppercase tracking-wide text-xs">Disc%</th>}
                <th className="text-right py-3 px-4 font-semibold uppercase tracking-wide text-xs">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-red-50/50"}>
                  <td className="py-2.5 px-4 text-gray-500">{i + 1}</td>
                  <td className="py-2.5 px-4">
                    <p className="font-semibold text-gray-800">{item.medicine_name}</p>
                    {item.company_name && <p className="text-[10px] text-gray-400">{item.company_name}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-center font-medium text-gray-700">{item.quantity}</td>
                  <td className="py-2.5 px-4 text-right font-medium text-gray-700 font-mono">৳{formatMoney(item.unit_price)}</td>
                  {isWholesale && <td className="py-2.5 px-4 text-center font-medium text-gray-700">{item.discount_percent ?? 0}%</td>}
                  <td className="py-2.5 px-4 text-right font-bold text-gray-900 font-mono">৳{formatMoney(item.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div data-pdf-section="summary" className="flex justify-end">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-semibold text-gray-800 font-mono">৳{formatMoney(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Discount ({sale.discount_percent}%)</span>
              <span className="font-semibold text-gray-800 font-mono">-৳{formatMoney(sale.discount_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal Less Discount</span>
              <span className="font-semibold text-gray-800 font-mono">৳{formatMoney(subtotalLessDiscount)}</span>
            </div>
            <div className="border-t-[3px] border-red-700 pt-3 mt-3 flex justify-between items-center">
              <span className="font-extrabold text-gray-900 text-base">Total Payable</span>
              <span className="text-red-700 font-mono text-xl font-extrabold">৳{formatMoney(sale.total)}</span>
            </div>
          </div>
        </div>

        {/* Closing message */}
        <p data-pdf-section="footer" className="text-xs text-gray-400 mt-6 italic">Thank you for your purchase. Please keep this invoice for your records.</p>

      </div>
    </div>
  );
};

export default Invoice;
