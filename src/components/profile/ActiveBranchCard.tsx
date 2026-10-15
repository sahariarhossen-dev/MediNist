import React, { useState } from "react";
import {
  Store,
  Warehouse,
  ChevronDown,
  Check,
  Building2,
  ShieldCheck,
  MapPin,
  Lock,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocationStore } from "@/contexts/LocationContext";
import { Location } from "@/types/location";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/**
 * Active Branch / Current Workspace Card for My Profile page.
 * Relocated from the top header to provide a dedicated workspace management card.
 */
export const ActiveBranchCard: React.FC = () => {
  const { locations, activeLocation, setActiveLocation, currentUserRole, isLoadingLocations } = useLocationStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Group locations
  const branches = locations.filter((loc) => loc.type === "branch");
  const warehouses = locations.filter((loc) => loc.type === "warehouse");

  const isSalesman = currentUserRole === "salesman";

  const handleSelect = (loc: Location) => {
    if (loc.id === activeLocation.id) {
      setOpen(false);
      return;
    }
    setActiveLocation(loc.id);
    setOpen(false);
    toast({
      title: "Workspace Changed",
      description: `Active branch switched to ${loc.name}${loc.code ? ` (${loc.code})` : ""}`,
    });
  };

  const getIconForType = (type: Location["type"], active: boolean) => {
    const iconClass = active ? "text-[#CC3333]" : "text-slate-500 group-hover:text-slate-800";
    if (type === "warehouse") {
      return <Warehouse size={16} className={iconClass} />;
    }
    return <Store size={16} className={iconClass} />;
  };

  // Clean branch display name without appended codes or legacy defaults
  const branchDisplayName = activeLocation.name || "Pharmacy";

  return (
    <div
      id="profile-active-branch-card"
      className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100"
    >
      {/* Header Label with store/location pin icon */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#CC3333]/10 text-[#CC3333] flex items-center justify-center shrink-0">
            <Store size={15} className="stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 leading-tight">Active Branch</h2>
            <p className="text-[11px] text-slate-500">Current Workspace</p>
          </div>
        </div>

        {isSalesman ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
            <Lock size={10} />
            Assigned
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded-full">
            {locations.length > 0 ? `${locations.length} Workspaces` : "1 Workspace"}
          </span>
        )}
      </div>

      {/* Branch Select Trigger / Read-Only Display */}
      {isSalesman ? (
        <div className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200/80 bg-slate-50/70 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-[#CC3333] shrink-0">
              <MapPin size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-slate-900 truncate">
                  {branchDisplayName}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {activeLocation.type}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {activeLocation.address || "Assigned branch location"}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md shrink-0 ml-2">
            Locked
          </span>
        </div>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              id="profile-active-branch-trigger"
              aria-expanded={open}
              aria-label="Switch active workspace"
              className={cn(
                "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group",
                open
                  ? "bg-white border-[#CC3333]/40 ring-2 ring-[#CC3333]/20 shadow-xs"
                  : "bg-slate-50/80 hover:bg-slate-100/80 border-slate-200/90 shadow-xs"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-[#CC3333] shrink-0 group-hover:scale-105 transition-transform">
                  {activeLocation.type === "warehouse" ? (
                    <Warehouse size={18} />
                  ) : (
                    <Store size={18} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {branchDisplayName}
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border",
                        activeLocation.type === "warehouse"
                          ? "bg-amber-50 text-amber-800 border-amber-200/70"
                          : "bg-emerald-50 text-emerald-800 border-emerald-200/70"
                      )}
                    >
                      {activeLocation.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {activeLocation.address || "Primary active workspace"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-slate-400 group-hover:text-slate-700 transition-colors ml-2 shrink-0">
                <span className="text-xs font-semibold text-slate-500 hidden xs:inline">
                  Switch
                </span>
                <ChevronDown
                  size={16}
                  className={cn(
                    "transition-transform duration-200 text-slate-500 group-hover:text-slate-800",
                    open && "transform rotate-180 text-[#CC3333]"
                  )}
                />
              </div>
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="center"
            sideOffset={8}
            className="w-[340px] sm:w-[380px] max-w-[calc(100vw-2.5rem)] p-0 rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden z-50 animate-in fade-in-0 zoom-in-95"
            id="profile-location-switcher-dropdown"
          >
            {/* Header Summary */}
            <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100/80 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-[#CC3333]/10 text-[#CC3333]">
                  <Building2 size={14} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">Switch Workspace</p>
                  <p className="text-[10px] text-slate-600">Select branch or warehouse</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7B1824] bg-[#CC3333]/10 px-2 py-0.5 rounded-full border border-[#CC3333]/20">
                <ShieldCheck size={10} />
                Workspace Manager
              </span>
            </div>

            {/* Scrollable Location List */}
            <div className="p-2 max-h-[320px] overflow-y-auto space-y-3">
              {isLoadingLocations ? (
                <div className="p-4 text-center text-xs text-slate-500">Loading workspaces...</div>
              ) : null}

              {/* BRANCHES GROUP */}
              {branches.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wider text-slate-600 uppercase flex items-center gap-1.5">
                      <Store size={11} className="text-[#CC3333]" /> Branches ({branches.length})
                    </span>
                  </div>
                  <div className="space-y-1 mt-1">
                    {branches.map((loc) => {
                      const isActive = loc.id === activeLocation.id;
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => handleSelect(loc)}
                          className={cn(
                            "group w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all",
                            isActive
                              ? "bg-[#CC3333]/10 border border-[#CC3333]/30 text-slate-900 shadow-xs"
                              : "hover:bg-slate-100/80 border border-transparent text-slate-700"
                          )}
                        >
                          <div
                            className={cn(
                              "p-2 rounded-lg shrink-0 mt-0.5 transition-colors",
                              isActive
                                ? "bg-white text-[#CC3333] shadow-xs border border-[#CC3333]/20"
                                : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-slate-800"
                            )}
                          >
                            {getIconForType(loc.type, isActive)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p
                                className={cn(
                                  "text-xs font-semibold truncate",
                                  isActive ? "text-[#7B1824] font-bold" : "text-slate-800"
                                )}
                              >
                                {loc.name}
                              </p>
                              {loc.code && (
                                <span className="text-[9px] font-mono font-medium text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                                  {loc.code}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 truncate mt-0.5">
                              {loc.address || "Branch location"}
                            </p>
                          </div>

                          {isActive && (
                            <div className="w-5 h-5 rounded-full bg-[#CC3333] text-white flex items-center justify-center shrink-0 mt-1 shadow-xs">
                              <Check size={12} className="stroke-[2.5]" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* WAREHOUSES GROUP */}
              {warehouses.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wider text-slate-600 uppercase flex items-center gap-1.5">
                      <Warehouse size={11} className="text-amber-600" /> Warehouses (
                      {warehouses.length})
                    </span>
                  </div>
                  <div className="space-y-1 mt-1">
                    {warehouses.map((loc) => {
                      const isActive = loc.id === activeLocation.id;
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => handleSelect(loc)}
                          className={cn(
                            "group w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all",
                            isActive
                              ? "bg-[#CC3333]/10 border border-[#CC3333]/30 text-slate-900 shadow-xs"
                              : "hover:bg-slate-100/80 border border-transparent text-slate-700"
                          )}
                        >
                          <div
                            className={cn(
                              "p-2 rounded-lg shrink-0 mt-0.5 transition-colors",
                              isActive
                                ? "bg-white text-[#CC3333] shadow-xs border border-[#CC3333]/20"
                                : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-slate-800"
                            )}
                          >
                            {getIconForType(loc.type, isActive)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p
                                className={cn(
                                  "text-xs font-semibold truncate",
                                  isActive ? "text-[#7B1824] font-bold" : "text-slate-800"
                                )}
                              >
                                {loc.name}
                              </p>
                              {loc.code && (
                                <span className="text-[9px] font-mono font-medium text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                                  {loc.code}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 truncate mt-0.5">
                              {loc.address || "Warehouse facility"}
                            </p>
                          </div>

                          {isActive && (
                            <div className="w-5 h-5 rounded-full bg-[#CC3333] text-white flex items-center justify-center shrink-0 mt-1 shadow-xs">
                              <Check size={12} className="stroke-[2.5]" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Summary */}
            <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="truncate">
                Active:{" "}
                <strong className="text-slate-800 font-semibold">
                  {branchDisplayName}
                </strong>
              </span>
              <span className="font-mono text-[10px] text-slate-600 shrink-0">
                {activeLocation.type.toUpperCase()}
              </span>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export default ActiveBranchCard;
