import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Receipt, Printer, X } from "lucide-react";
import { format, parseISO } from "date-fns";

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
}

interface PharmacyData {
  name: string;
  address: string | null;
  division: string | null;
  district: string | null;
  upazila: string | null;
}

const Invoice = () => {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [sale, setSale] = useState<SaleData | null>(null);
  const [items, setItems] = useState<SaleItemData[]>([]);
  const [pharmacy, setPharmacy] = useState<PharmacyData | null>(null);
  const [sellerName, setSellerName] = useState("");
  const [loading, setLoading] = useState(true);

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
        supabase.from("sale_items").select("id, medicine_name, company_name, quantity, unit_price, total_price").eq("sale_id", saleId),
        supabase.from("pharmacies").select("name, address, division, district, upazila").eq("id", saleData.pharmacy_id).single(),
        supabase.from("profiles").select("full_name").eq("id", saleData.user_id).single(),
      ]);

      setItems((itemsRes.data as SaleItemData[]) || []);
      setPharmacy(pharmacyRes.data as PharmacyData | null);
      setSellerName(sellerRes.data?.full_name || "Staff");
      setLoading(false);
    };
    load();
  }, [saleId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Invoice not found</p>
        <button onClick={() => navigate("/sales")} className="text-emerald-600 font-semibold">Back to Sales</button>
      </div>
    );
  }

  const invoiceId = `INV-${sale.id.slice(0, 11)}`;
  const dateObj = parseISO(sale.created_at);
  const timeStr = format(dateObj, "HH:mm");
  const dateStr = format(dateObj, "dd-MM-yy");
  const subtotalLessDiscount = Number(sale.subtotal) - Number(sale.discount_amount);
  const pharmacyAddress = [pharmacy?.address, pharmacy?.upazila, pharmacy?.district, pharmacy?.division].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Top bar — hidden on print */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between max-w-3xl mx-auto">
        <button onClick={() => navigate("/sales")} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition">
          <X className="w-5 h-5" /> Close
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-emerald-700 transition">
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-lg print:shadow-none print:rounded-none my-4 print:my-0 p-8 print:p-6">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-emerald-600 pb-5 mb-6">
          {/* Left — Pharmacy info */}
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{pharmacy?.name || "Pharmacy"}</h1>
            {pharmacyAddress && <p className="text-sm text-gray-500">{pharmacyAddress}</p>}
            {profile?.phone && <p className="text-sm text-gray-500">Mob: {profile.phone}</p>}
          </div>

          {/* Right — Invoice meta */}
          <div className="text-right space-y-1">
            <div className="flex items-center justify-end gap-2">
              <Receipt className="w-7 h-7 text-emerald-600" />
              <h2 className="text-2xl font-extrabold text-emerald-700 tracking-tight uppercase">Invoice</h2>
            </div>
            <p className="text-xs text-gray-500">Confirmed By: <span className="font-semibold text-gray-700">{sellerName}</span></p>
            <p className="text-xs text-gray-500">Type: <span className="font-semibold text-gray-700 capitalize">{sale.sale_type}</span></p>
            <p className="text-xs text-gray-500">ID: <span className="font-semibold text-gray-700">{invoiceId}</span></p>
            <p className="text-xs text-gray-500">Date: <span className="font-semibold text-gray-700">{timeStr} / {dateStr}</span></p>
          </div>
        </div>

        {/* Items table */}
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-emerald-600 text-white">
                <th className="text-left py-3 px-4 font-semibold uppercase tracking-wide text-xs">#</th>
                <th className="text-left py-3 px-4 font-semibold uppercase tracking-wide text-xs">Description</th>
                <th className="text-center py-3 px-4 font-semibold uppercase tracking-wide text-xs">Qty</th>
                <th className="text-right py-3 px-4 font-semibold uppercase tracking-wide text-xs">Unit Price</th>
                <th className="text-right py-3 px-4 font-semibold uppercase tracking-wide text-xs">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-emerald-50/50"}>
                  <td className="py-2.5 px-4 text-gray-500">{i + 1}</td>
                  <td className="py-2.5 px-4">
                    <p className="font-semibold text-gray-800">{item.medicine_name}</p>
                    {item.company_name && <p className="text-[10px] text-gray-400">{item.company_name}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-center font-medium text-gray-700">{item.quantity}</td>
                  <td className="py-2.5 px-4 text-right font-medium text-gray-700">৳{Number(item.unit_price).toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-gray-900">৳{Number(item.total_price).toLocaleString()}</td>
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
              <span className="font-semibold text-gray-800">৳{Number(sale.subtotal).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Discount ({sale.discount_percent}%)</span>
              <span className="font-semibold text-gray-800">-৳{Number(sale.discount_amount).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal Less Discount</span>
              <span className="font-semibold text-gray-800">৳{subtotalLessDiscount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tax Rate</span>
              <span className="font-semibold text-gray-800">0.00%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total Tax</span>
              <span className="font-semibold text-gray-800">৳0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Shipping/Handling</span>
              <span className="font-semibold text-gray-800">৳0</span>
            </div>
            <div className="border-t-2 border-emerald-600 pt-2 mt-2 flex justify-between">
              <span className="font-extrabold text-gray-900 text-base">Balance Due</span>
              <span className="font-extrabold text-emerald-700 text-lg">৳{Number(sale.total).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Remarks */}
        <div className="mt-8 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Remarks</p>
          <p className="text-sm text-gray-500 italic">Thank you for your purchase. Please keep this invoice for your records.</p>
        </div>
      </div>
    </div>
  );
};

export default Invoice;
