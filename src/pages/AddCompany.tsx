import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";

const AddCompany = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const formData = location.state?.formData;

  useEffect(() => {
    if (!profile?.pharmacy_id) return;
    const fetchCompanies = async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .eq("pharmacy_id", profile.pharmacy_id!)
        .order("name");
      setCompanies(data ?? []);
      setLoading(false);
    };
    fetchCompanies();
  }, [profile?.pharmacy_id]);

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (name: string) => {
    navigate("/add-product", { state: { ...formData, companyName: name } });
  };

  const handleAddNew = async () => {
    const trimmed = search.trim();
    if (!trimmed) {
      toast.error("Please enter a company name");
      return;
    }
    if (!profile?.pharmacy_id) return;

    setAdding(true);
    const { error } = await supabase.from("companies").insert({
      name: trimmed,
      pharmacy_id: profile.pharmacy_id,
    });
    setAdding(false);

    if (error) {
      toast.error("Failed to add company");
    } else {
      toast.success("Company added!");
      handleSelect(trimmed);
    }
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
        <h1 className="text-lg font-bold text-foreground">Add New Company</h1>
      </div>

      <div className="px-5 py-5 space-y-4">
        <Input
          placeholder="Company Name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl bg-muted border-0 h-12 text-base"
          autoFocus
        />

        <button
          onClick={handleAddNew}
          disabled={adding || !search.trim()}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-primary/40 text-primary font-semibold py-3 rounded-2xl text-sm disabled:opacity-40 hover:bg-primary/5 transition-colors"
        >
          <Plus size={18} />
          {adding ? "Adding..." : "+ Add New Company"}
        </button>

        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm pt-8">
            {search ? "No matching companies" : "No companies added yet"}
          </p>
        ) : (
          <div className="space-y-2 pt-2">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c.name)}
                className="w-full flex items-center gap-3 px-4 py-3.5 bg-muted rounded-2xl text-left hover:bg-muted/80 transition-colors"
              >
                <Building2 size={18} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AddCompany;
