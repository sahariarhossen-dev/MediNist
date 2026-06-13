import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import useDebounce from "@/hooks/useDebounce";

const AddCompany = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const formData = location.state?.formData;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_master_companies", {
        _search: debouncedSearch || null,
      });
      if (cancelled) return;
      if (!error && data) {
        setCompanies((data as { name: string }[]).map((r) => r.name));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const sorted = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    if (!q) return companies;
    return [...companies].sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b);
    });
  }, [companies, debouncedSearch]);

  const handleSelect = (name: string) => {
    navigate("/add-product", { state: { ...formData, companyName: name } });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/add-product", { state: formData })}
          className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">Select Your Company</h1>
      </div>

      <div className="px-5 py-5 space-y-4">
        <Input
          placeholder="Search master catalog..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl bg-muted border-0 h-12 text-base"
          autoFocus
        />
        <p className="text-xs text-muted-foreground px-1">
          Companies are sourced from the verified master catalog to keep product data consistent across all pharmacies.
        </p>

        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm pt-8">
            {search ? "No matching companies in the master catalog" : "No companies found"}
          </p>
        ) : (
          <div className="space-y-2 pt-2">
            {sorted.map((c) => (
              <button
                key={c}
                onClick={() => handleSelect(c)}
                className="w-full flex items-center gap-3 px-4 py-3.5 bg-muted rounded-2xl text-left hover:bg-muted/80 transition-colors"
              >
                <Building2 size={18} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground">{c}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AddCompany;
