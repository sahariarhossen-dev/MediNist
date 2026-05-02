import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, PackageX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { totalPiecesToTriUnit, isSingleUnit, isLowStock } from "@/lib/stockUtils";
import { truncateName, truncateStrength } from "@/lib/formatUtils";
import { getProductTypeChipClasses, getDisplayCategory, isPowderType, detectPowderUnit } from "@/lib/productType";
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
  unit_format: string | null;
  company_name: string | null;
  stock_quantity: number;
  strip_per_pack: number | null;
  pcs_per_strip: number | null;
  price: number | null;
  product_size: string | null;
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
        .select("id, name, product_type, unit_format, company_name, stock_quantity, price, stock_alert, strip_per_pack, pcs_per_strip, product_size")
        .eq("pharmacy_id", profile.pharmacy_id);

      const filtered = (data ?? [])
        .filter((m) => isLowStock(m))
        .map((m) => ({
          id: m.id,
          name: m.name,
          product_type: m.product_type,
          unit_format: (m as { unit_format: string | null }).unit_format,
          company_name: m.company_name,
          stock_quantity: m.stock_quantity ?? 0,
          strip_per_pack: m.strip_per_pack,
          pcs_per_strip: m.pcs_per_strip,
          price: m.price,
          product_size: m.product_size,
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
    <div className="min-h-screen bg-[#F4F6FB] w-full max-w-md mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 px-page pt-5 pb-4">
        <button
          onClick={() => navigate("/")}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition"
        >
          <ArrowLeft size={22} className="text-gray-700" />
        </button>
        <h1 className="text-fluid-lg font-bold text-gray-900">Short Items</h1>
        <div className="ml-auto">
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-auto max-w-[45vw] sm:max-w-[14rem] h-9 text-fluid-xs bg-white shadow-sm rounded-lg border-gray-200 focus:ring-emerald-500 focus:ring-offset-0">
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
      <div className="px-page">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="w-full overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[20rem] text-fluid-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-2 py-3 text-fluid-xs font-semibold text-gray-400 whitespace-nowrap">Product</th>
                  <th className="text-left px-1.5 py-3 text-fluid-xs font-semibold text-gray-400 whitespace-nowrap">Category</th>
                  <th className="text-center px-1.5 py-3 text-fluid-xs font-semibold text-gray-400 whitespace-nowrap">STK</th>
                  <th className="text-right px-2 py-3 text-fluid-xs font-semibold text-gray-400 whitespace-nowrap">Price</th>
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
                      <p className="text-gray-400 text-fluid-sm">
                        {selectedCompany === "all"
                          ? "No short items found"
                          : "No short items for this company"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  displayedItems.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-2 py-3 font-medium text-gray-900">
                        <span className="flex items-center gap-1">
                          <span className="truncate">{truncateName(item.name)}</span>
                          {item.product_size && <span className="text-fluid-xs text-gray-400 font-normal flex-shrink-0">{truncateStrength(item.product_size)}</span>}
                        </span>
                      </td>
                      <td className="px-1.5 py-3 text-gray-500">
                        {item.product_type ? (
                          <span
                            title={item.product_type}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${getProductTypeChipClasses(item.product_type)}`}
                          >
                            {getDisplayCategory(item.product_type)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`px-1.5 py-3 font-mono text-left whitespace-nowrap tabular-nums ${stockColor(item.stock_quantity)}`}>
                        <span className="whitespace-nowrap tabular-nums">
                          {isSingleUnit(item)
                            ? (isPowderType(item.product_type || item.unit_format)
                                ? `${item.stock_quantity} ${detectPowderUnit(item.product_size || item.unit_format)}${item.stock_quantity === 1 ? "" : "s"}`
                                : `${item.stock_quantity} Pcs`)
                            : totalPiecesToTriUnit(item.stock_quantity, item.strip_per_pack, item.pcs_per_strip)}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-right text-gray-700 whitespace-nowrap tabular-nums">
                        ৳{Number(item.price ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-fluid-xs text-gray-400 mt-3 px-1">
          Showing products with stock at or below their alert threshold.
        </p>
      </div>
    </div>
  );
};

export default ShortItems;
