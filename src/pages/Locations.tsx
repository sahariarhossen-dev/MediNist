import React, { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import {
  Store,
  Warehouse,
  Plus,
  MoreVertical,
  MapPin,
  Building2,
  Check,
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Edit2,
  Trash2,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { AddLocationModal } from "@/components/locations/AddLocationModal";
import { EditLocationModal } from "@/components/locations/EditLocationModal";
import { Location } from "@/types/location";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const LocationsPage: React.FC = () => {
  const { profile } = useAuth();
  const {
    locations,
    activeLocation,
    setActiveLocation,
    toggleLocationStatus,
    updateLocation,
    deleteLocation,
    currentUserRole,
  } = useLocationStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "branch" | "warehouse">("all");

  // Filtered locations
  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      const matchesSearch =
        loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (loc.code && loc.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        loc.address.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === "all" || loc.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [locations, searchQuery, typeFilter]);

  const totalBranches = locations.filter((l) => l.type === "branch").length;
  const totalWarehouses = locations.filter((l) => l.type === "warehouse").length;
  const totalActive = locations.filter((l) => l.is_active !== false).length;

  const handleSwitchActive = (loc: Location) => {
    setActiveLocation(loc.id);
    toast.success(`Active workspace switched to ${loc.name}`);
  };

  const handleEdit = (loc: Location) => {
    setEditingLocation(loc);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (loc: Location) => {
    const isConfirmed = window.confirm(
      `Are you sure you want to remove "${loc.name}"? This action cannot be undone.`
    );
    if (!isConfirmed) return;

    await deleteLocation(loc.id);
  };

  const handleToggleStatus = async (loc: Location) => {
    await toggleLocationStatus(loc.id);
  };

  // Security Guard: Strictly for 'owner' - immediately redirect to Dashboard without displaying any error splash or locked screen
  const normalizedProfileRole = (profile?.role || "").toLowerCase().trim();
  const isOwner = normalizedProfileRole === "owner" && currentUserRole === "owner";
  if (!isOwner) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] pb-24 text-left">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Top Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="hover:text-slate-700 cursor-pointer">Enterprise</span>
            <span>/</span>
            <span className="font-semibold text-slate-900">Branches & Warehouses</span>
          </div>
        </div>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#CC3333]/10 text-[#CC3333] flex items-center justify-center font-bold">
                <Building2 size={18} />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Branches & Warehouses
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 pl-11">
              Manage your company branches and storage warehouses across regions.
            </p>
          </div>

          {/* Primary Action Button */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              id="add-location-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#CC3333] hover:bg-[#B22222] text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-[#CC3333]/40 active:scale-[0.98]"
            >
              <Plus size={16} className="stroke-[2.5]" />
              Add New Branch / Warehouse
            </button>
          </div>
        </div>

        {/* Metric Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Total Facilities
            </p>
            <p className="text-2xl font-bold text-slate-900">{locations.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Store size={12} className="text-[#CC3333]" /> Retail Branches
            </p>
            <p className="text-2xl font-bold text-slate-900">{totalBranches}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Warehouse size={12} className="text-amber-600" /> Warehouses
            </p>
            <p className="text-2xl font-bold text-slate-900">{totalWarehouses}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-emerald-600" /> Operational
            </p>
            <p className="text-2xl font-bold text-emerald-700">{totalActive}</p>
          </div>
        </div>

        {/* Data Table Card Container */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          {/* Table Controls (Search & Filter) */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by branch name, code, or address..."
                className="w-full pl-9 pr-4 py-2 rounded-xl text-xs sm:text-sm border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#CC3333]/20 focus:border-[#CC3333] transition-all"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <SlidersHorizontal size={14} className="text-slate-600 hidden xs:block" />
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200/60 text-xs">
                <button
                  type="button"
                  onClick={() => setTypeFilter("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-medium transition-all",
                    typeFilter === "all" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  All ({locations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter("branch")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-medium transition-all",
                    typeFilter === "branch" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Branches ({totalBranches})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter("warehouse")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-medium transition-all",
                    typeFilter === "warehouse" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Warehouses ({totalWarehouses})
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  <th className="py-3 px-4">Branch / Warehouse Name</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {filteredLocations.length > 0 ? (
                  filteredLocations.map((loc) => {
                    const isCurrentlyActive = loc.id === activeLocation.id;
                    const isActiveStatus = loc.is_active !== false;

                    return (
                      <tr
                        key={loc.id}
                        className={cn(
                          "hover:bg-slate-50/70 transition-colors group",
                          isCurrentlyActive && "bg-[#CC3333]/[0.02]"
                        )}
                      >
                        {/* Name & Active Switch Badge */}
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                loc.type === "warehouse"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                                  : "bg-[#CC3333]/10 text-[#CC3333] border border-[#CC3333]/20"
                              )}
                            >
                              {loc.type === "warehouse" ? <Warehouse size={15} /> : <Store size={15} />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-slate-900 truncate">
                                  {loc.name}
                                </span>
                                {isCurrentlyActive && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#CC3333] text-white shadow-xs">
                                    <Check size={10} className="stroke-[3]" /> Active
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-mono text-slate-600 block">
                                ID: {loc.id}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Code */}
                        <td className="py-3.5 px-4">
                          {loc.code ? (
                            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md border border-slate-200/80">
                              {loc.code}
                            </span>
                          ) : (
                            <span className="text-slate-600 italic">None</span>
                          )}
                        </td>

                        {/* Type Badge */}
                        <td className="py-3.5 px-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border",
                              loc.type === "warehouse"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-emerald-50 text-emerald-800 border-emerald-200"
                            )}
                          >
                            {loc.type === "warehouse" ? (
                              <>
                                <Warehouse size={12} /> Warehouse
                              </>
                            ) : (
                              <>
                                <Store size={12} /> Retail Branch
                              </>
                            )}
                          </span>
                        </td>

                        {/* Address */}
                        <td className="py-3.5 px-4 max-w-xs text-slate-600">
                          <div className="flex items-start gap-1.5">
                            <MapPin size={13} className="text-slate-600 shrink-0 mt-0.5" />
                            <span className="truncate">{loc.address}</span>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border",
                              isActiveStatus
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            )}
                          >
                            {isActiveStatus ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Active
                              </>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                Inactive
                              </>
                            )}
                          </span>
                        </td>

                        {/* More Action Menu */}
                        <td className="py-3.5 px-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label="Branch actions"
                                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                              >
                                <MoreVertical size={16} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-white rounded-xl shadow-lg border border-slate-200 p-1 text-xs">
                              <DropdownMenuLabel className="text-[10px] text-slate-600 font-bold uppercase tracking-wider px-2 py-1">
                                Facility Actions
                              </DropdownMenuLabel>
                              {!isCurrentlyActive && (
                                <DropdownMenuItem
                                  onClick={() => handleSwitchActive(loc)}
                                  className="gap-2 cursor-pointer text-slate-700 hover:text-[#CC3333] hover:bg-[#CC3333]/10 font-semibold"
                                >
                                  <ArrowRight size={13} />
                                  Switch to this Branch
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleToggleStatus(loc)}
                                className="gap-2 cursor-pointer text-slate-700"
                              >
                                {isActiveStatus ? (
                                  <>
                                    <XCircle size={13} className="text-amber-500" /> Mark as Inactive
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 size={13} className="text-emerald-500" /> Mark as Active
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleEdit(loc)}
                                className="gap-2 cursor-pointer text-slate-700"
                              >
                                <Edit2 size={13} /> Edit Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(loc)}
                                className="gap-2 cursor-pointer text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              >
                                <Trash2 size={13} /> Remove Branch / Warehouse
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                          <Building2 size={24} />
                        </div>
                        <p className="text-sm font-semibold text-slate-700">No branches or warehouses found</p>
                        <p className="text-xs text-slate-600">
                          Try adjusting your search query or register a new branch / warehouse.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Grid (Responsive for tablets & phones) */}
          <div className="block md:hidden divide-y divide-slate-100">
            {filteredLocations.length > 0 ? (
              filteredLocations.map((loc) => {
                const isCurrentlyActive = loc.id === activeLocation.id;
                const isActiveStatus = loc.is_active !== false;

                return (
                  <div key={loc.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            loc.type === "warehouse"
                              ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                              : "bg-[#CC3333]/10 text-[#CC3333] border border-[#CC3333]/20"
                          )}
                        >
                          {loc.type === "warehouse" ? <Warehouse size={15} /> : <Store size={15} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-sm font-bold text-slate-900">{loc.name}</h3>
                            {isCurrentlyActive && (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#CC3333] text-white">
                                Active
                              </span>
                            )}
                          </div>
                          {loc.code && (
                            <span className="text-[10px] font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                              {loc.code}
                            </span>
                          )}
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Branch actions"
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-white rounded-xl shadow-lg border border-slate-200 p-1 text-xs">
                          {!isCurrentlyActive && (
                            <DropdownMenuItem
                              onClick={() => handleSwitchActive(loc)}
                              className="gap-2 cursor-pointer font-semibold text-[#CC3333]"
                            >
                              <ArrowRight size={13} /> Switch Active
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleToggleStatus(loc)} className="gap-2 cursor-pointer">
                            {isActiveStatus ? "Mark Inactive" : "Mark Active"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(loc)} className="gap-2 cursor-pointer">
                            <Edit2 size={13} /> Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(loc)} className="gap-2 cursor-pointer text-rose-600">
                            <Trash2 size={13} /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <MapPin size={12} className="text-slate-600 shrink-0" />
                      <span className="truncate">{loc.address}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                          loc.type === "warehouse"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200"
                        )}
                      >
                        {loc.type === "warehouse" ? "Warehouse" : "Retail Branch"}
                      </span>

                      <span
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-md",
                          isActiveStatus ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {isActiveStatus ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <Building2 size={24} className="mx-auto text-slate-400" />
                <p className="text-xs font-semibold">No branches or warehouses found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Location Modal */}
      <AddLocationModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />

      {/* Edit Location Modal */}
      <EditLocationModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        location={editingLocation}
      />
    </div>
  );
};

export default LocationsPage;
