import { Sparkles, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const DemoBanner = () => {
  const { isDemo, signOut } = useAuth();
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);

  if (!isDemo) return null;

  const handleExit = async () => {
    setExiting(true);
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="sticky top-0 z-40 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-2 flex items-center gap-2 text-xs sm:text-sm shadow-md">
      <Sparkles size={16} className="shrink-0" />
      <span className="flex-1 truncate">
        <strong>Demo Mode:</strong> Test freely — data resets on exit.
      </span>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="inline-flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1 text-xs font-semibold transition disabled:opacity-60"
      >
        <LogOut size={12} /> {exiting ? "Exiting…" : "Exit Demo"}
      </button>
    </div>
  );
};

export default DemoBanner;