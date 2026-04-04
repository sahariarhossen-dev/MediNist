import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Check, X, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";

const AddCompany = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInlineAdd, setShowInlineAdd] = useState(false);
  const [newName, setNewName] = useState("");
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

  const filtered = companies
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const q = search.toLowerCase();
      if (!q) return a.name.localeCompare(b.name);
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name);
    });

  const trimmedNew = newName.trim();
  const isDuplicate = trimmedNew.length > 0 && companies.some(
    (c) => c.name.toLowerCase() === trimmedNew.toLowerCase()
  );
  const isValidNew = trimmedNew.length > 0 && !isDuplicate;

  const handleSelect = (name: string) => {
    navigate("/add-product", { state: { ...formData, companyName: name } });
  };

  const handleSaveNew = async () => {
    if (!isValidNew || !profile?.pharmacy_id) return;

    setAdding(true);
    const { data, error } = await supabase
      .from("companies")
      .insert({ name: trimmedNew, pharmacy_id: profile.pharmacy_id })
      .select("id, name")
      .single();
    setAdding(false);

    if (error) {
      toast.error("Failed to add company");
    } else if (data) {
      toast.success("Company added!");
      setCompanies((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setShowInlineAdd(false);
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
        <h1 className="text-lg font-bold text-foreground">Select Your Company</h1>
      </div>

      <div className="px-5 py-5 space-y-4">
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl bg-muted border-0 h-12 text-base"
          autoFocus
        />

        {/* Add New Company toggle / inline form */}
        {!showInlineAdd ? (
          <button
            onClick={() => setShowInlineAdd(true)}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-primary/40 text-primary font-semibold py-3 rounded-2xl text-sm hover:bg-primary/5 transition-colors"
          >
            <Plus size={18} />
            + Add New Company
          </button>
        ) : (
          <div className="border border-border rounded-2xl p-4 space-y-3 bg-card">
            <div className="relative">
              <Input
                placeholder="Enter company name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-xl bg-muted border-0 h-12 text-base pr-10"
                autoFocus
              />
              {trimmedNew.length > 0 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isDuplicate ? (
                    <X size={18} className="text-destructive" />
                  ) : (
                    <Check size={18} className="text-green-600" />
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-medium ${
                  trimmedNew.length === 0
                    ? "text-muted-foreground"
                    : isDuplicate
                    ? "text-destructive"
                    : "text-green-600"
                }`}
              >
                {trimmedNew.length === 0
                  ? ""
                  : isDuplicate
                  ? "Already Exists"
                  : "Don't Match"}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowInlineAdd(false);
                    setNewName("");
                  }}
                  className="px-4 py-2 text-xs font-medium text-muted-foreground rounded-xl hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNew}
                  disabled={!isValidNew || adding}
                  className={`px-5 py-2 text-xs font-bold rounded-xl transition-colors ${
                    isValidNew
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                  }`}
                >
                  {adding ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

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
