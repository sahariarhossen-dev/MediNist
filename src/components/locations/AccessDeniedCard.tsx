import React from "react";
import { Lock, ShieldAlert, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocationStore } from "@/contexts/LocationContext";

export const AccessDeniedCard: React.FC = () => {
  const navigate = useNavigate();
  const { currentUserRole } = useLocationStore();

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/90 shadow-xl p-8 space-y-6 relative overflow-hidden">
        {/* Subtle accent top border */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#CC3333] to-[#7B1824]" />

        {/* Lock Shield Visual */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-[#CC3333] shadow-inner">
          <Lock size={32} className="stroke-[2.2]" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200/70">
            <ShieldAlert size={12} />
            Restricted Area
          </span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Owner Clearance Required
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            Multi-location topology, branch provisioning, and godown storage facilities can only be managed by authorized <strong>Pharmacy Owners</strong>.
          </p>
        </div>

        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 text-left space-y-1 text-xs">
          <div className="flex items-center justify-between text-slate-600">
            <span>Your Detected Role:</span>
            <span className="font-semibold uppercase tracking-wider text-slate-900 bg-slate-200 px-2 py-0.5 rounded text-[10px]">
              {currentUserRole}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Salesmen and store managers operate strictly within their assigned location scope.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={14} />
            Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
