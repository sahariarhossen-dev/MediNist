import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { X, Download, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { formatMoney } from "@/lib/formatUtils";

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
    try {
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
      pdf.save(`${invoiceId}.pdf`);
    } catch (e) {
      console.error("PDF generation failed", e);
    } finally {
      setDownloading(false);
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
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 py-3 flex items-center justify-between max-w-3xl mx-auto px-4">
        <button onClick={() => navigate("/sales")} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition text-sm">
          <X className="w-4 h-4" /> Close
        </button>
        <button
          onClick={handleDownloadPDF}
          disabled={downloading}
          className="flex items-center gap-2 bg-red-700 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-800 transition text-sm disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {downloading ? "Generating..." : "Download PDF"}
        </button>
      </div>

      {/* Invoice content */}
      <div id="invoice-content" className="max-w-3xl mx-auto bg-white rounded-lg shadow-lg print:shadow-none print:rounded-none my-4 print:my-0 p-8 print:p-6">
        
        {/* Two-column header with vertical divider */}
        <div className="flex items-center mb-1">
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
        <div className="h-[3px] bg-red-700 mb-6 py-0 my-[15px]" />

        {/* Items table */}
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
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
        <div className="flex justify-end">
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
        <p className="text-xs text-gray-400 mt-6 italic">Thank you for your purchase. Please keep this invoice for your records.</p>

      </div>
    </div>
  );
};

export default Invoice;
