import React, { useState } from "react";
import {
  MapPin,
  ChevronDown,
  Store,
  Warehouse,
  Check,
  Building2,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocationStore } from "@/contexts/LocationContext";
import { Location } from "@/types/location";
import { cn } from "@/lib/utils";

/**
 * Global Location Switcher (The Control Room)
 * Provides multi-location context switching for Owners and Managers,
 * while locking Salesmen to their assigned location without revealing other locations.
 */
const LocationSwitcher: React.FC = () => {
  const { locations, activeLocation, setActiveLocation, currentUserRole } = useLocationStore();
  const [open, setOpen] = useState(false);

  // Group locations into Branches and Warehouses
  const branches = locations.filter((loc) => loc.type === "branch");
  const warehouses = locations.filter((loc) => loc.type === "warehouse");

  // Role-Based Logic:
  // If currentUserRole === 'salesman', do NOT render the interactive dropdown.
  // Instead, render a clean, static, read-only location badge.
  if (currentUserRole === "salesman") {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/80 border border-slate-200/80 text-slate-700 shadow-sm select-none"
        title="Assigned Branch"
        id="location-static-badge"
      >
        <MapPin size={14} className="text-[#CC3333] shrink-0" />
        <span className="text-xs font-semibold text-slate-800 max-w-[120px] sm:max-w-[160px] truncate">
          {activeLocation.name}
        </span>
        <span className="hidden sm:inline-block text-[10px] uppercase tracking-wider font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
          {activeLocation.type}
        </span>
      </div>
    );
  }

  const handleSelect = (location: Location) => {
    setActiveLocation(location.id);
    setOpen(false);
  };

  const getIconForType = (type: Location["type"], active: boolean) => {
    const iconClass = active ? "text-[#CC3333]" : "text-slate-500 group-hover:text-slate-800";
    if (type === "warehouse") {
      return <Warehouse size={16} className={iconClass} />;
    }
    return <Store size={16} className={iconClass} />;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id="location-switcher-trigger"
          aria-expanded={open}
          aria-label="Switch location"
          className={cn(
            "group inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-left",
            "bg-white/90 hover:bg-[#F3F4F6] border border-slate-200/90 shadow-sm hover:shadow",
            "transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#CC3333]/40",
            open && "ring-2 ring-[#CC3333]/30 border-[#CC3333]/40 bg-white"
          )}
        >
          {/* Location Pin Icon */}
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-[#CC3333]/10 text-[#CC3333] shrink-0 group-hover:scale-105 transition-transform">
            <MapPin size={14} className="stroke-[2.2]" />
          </div>

          {/* Active Location Info */}
          <div className="flex flex-col min-w-0 pr-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 leading-none mb-0.5">
              Location
            </span>
            <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate max-w-[110px] xs:max-w-[130px] sm:max-w-[160px] md:max-w-[200px] leading-tight">
              {activeLocation.name}
            </span>
          </div>

          {/* Type Badge */}
          <span
            className={cn(
              "hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border",
              activeLocation.type === "warehouse"
                ? "bg-amber-50 text-amber-800 border-amber-200/70"
                : "bg-emerald-50 text-emerald-800 border-emerald-200/70"
            )}
          >
            {activeLocation.type}
          </span>

          {/* Chevron Indicator */}
          <ChevronDown
            size={14}
            className={cn(
              "text-slate-600 group-hover:text-slate-800 transition-transform duration-200 shrink-0",
              open && "transform rotate-180 text-[#CC3333]"
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 sm:w-80 p-0 rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden z-50 animate-in fade-in-0 zoom-in-95"
        id="location-switcher-dropdown"
      >
        {/* Header Summary */}
        <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100/80 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-[#CC3333]/10 text-[#CC3333]">
              <Building2 size={14} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Switch Workspace</p>
              <p className="text-[10px] text-slate-600">MediNist Multi-Location Control</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7B1824] bg-[#CC3333]/10 px-2 py-0.5 rounded-full border border-[#CC3333]/20">
            <ShieldCheck size={10} />
            Owner Mode
          </span>
        </div>

        {/* Scrollable Location List */}
        <div className="p-2 max-h-[340px] overflow-y-auto space-y-3">
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
                            <span className="text-[9px] font-mono font-medium text-slate-600 bg-slate-100 px-1 py-0.2 rounded shrink-0">
                              {loc.code}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 truncate mt-0.5">{loc.address}</p>
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
                  <Warehouse size={11} className="text-amber-600" /> Warehouses ({warehouses.length})
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
                            <span className="text-[9px] font-mono font-medium text-slate-600 bg-slate-100 px-1 py-0.2 rounded shrink-0">
                              {loc.code}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 truncate mt-0.5">{loc.address}</p>
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

        {/* Footer info & active location notification */}
        <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span className="truncate">
            Active: <strong className="text-slate-800 font-semibold">{activeLocation.name}</strong>
          </span>
          <span className="font-mono text-[10px] text-slate-600 shrink-0">
            {activeLocation.id}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default LocationSwitcher;
