import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, PackageX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LowStockItem {
  id: string;
  name: string;
  product_type: string | null;
  company_name: string | null;
  stock_quantity: number;
  price: number | null;
}

const ShortItems = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState("all");

  useEffect(() => {
    const fetchLowStock = async () => {
      if (!profile?.pharmacy_id) return;
      const { data } = await supabase
        .from("medicines")
        .select("id, name, product_type, company_name, stock_quantity, price, stock_alert")
        .eq("pharmacy_id", profile.pharmacy_id);

      const filtered = (data ?? [])
        .filter((m) => {
          const threshold = m.stock_alert && m.stock_alert > 0 ? m.stock_alert : 5;
          return (m.stock_quantity ?? 0) <= threshold;
        })
        .map((m) => ({
          id: m.id,
          name: m.name,
          product_type: m.product_type,
          company_name: m.company_name,
          stock_quantity: m.stock_quantity ?? 0,
          price: m.price,
        }));

      setItems(filtered);
      setLoading(false);
    };
    fetchLowStock();
  }, [profile?.pharmacy_id]);

  const companies = useMemo(
    () =>
      [...new Set(items.map((i) => i.company_name).filter(Boolean) as string[])].sort(),
    [items]
  );

  const displayedItems = useMemo(
    () =>
      selectedCompany === "all"
        ? items
        : items.filter((i) => i.company_name === selectedCompany),
    [items, selectedCompany]
  );

  const stockColor = (qty: number) =>
    qty === 0 ? "text-red-600 font-bold" : "text-orange-500 font-semibold";

  return (
    <div className="min-h-screen bg-[#F4F6FB] max-w-md mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button
          onClick={() => navigate("/")}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition"
        >
          <ArrowLeft size={22} className="text-gray-700" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Short Items</h1>
        <div className="ml-auto">
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-[140px] h-9 text-xs bg-white shadow-sm rounded-lg border-gray-200 focus:ring-emerald-500 focus:ring-offset-0">
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="px-4">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Product</th>
                <th className="text-left px-2 py-3 text-xs font-semibold text-gray-400">Category</th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-gray-400">STK</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">Price</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400">Loading...</td>
                </tr>
              ) : displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12">
                    <PackageX size={36} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-400 text-sm">
                      {selectedCompany === "all"
                        ? "No short items found"
                        : "No short items for this company"}
                    </p>
                  </td>
                </tr>
              ) : (
                displayedItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-2 py-3 text-gray-500">{item.product_type ?? "—"}</td>
                    <td className={`px-2 py-3 text-center ${stockColor(item.stock_quantity)}`}>
                      {item.stock_quantity}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      ৳{Number(item.price ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-3 px-1">
          Showing products with stock at or below their alert threshold.
        </p>
      </div>
    </div>
  );
};

export default ShortItems;
