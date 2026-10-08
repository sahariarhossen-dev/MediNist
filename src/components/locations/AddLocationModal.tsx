import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Store, Warehouse, MapPin, Hash, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLocationStore } from "@/contexts/LocationContext";
import { LocationType } from "@/types/location";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AddLocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddLocationModal: React.FC<AddLocationModalProps> = ({ open, onOpenChange }) => {
  const { addLocation, locations } = useLocationStore();

  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("branch");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; address?: string; code?: string }>({});

  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setName("");
    setType("branch");
    setCode("");
    setAddress("");
    setIsActive(true);
    setErrors({});
    setIsSubmitting(false);
  };

  const validate = () => {
    const newErrors: { name?: string; address?: string; code?: string } = {};
    if (!name.trim()) {
      newErrors.name = type === "warehouse" ? "Warehouse name is required" : "Branch name is required";
    }
    if (!address.trim()) {
      newErrors.address = "Physical address is required";
    }
    if (code.trim()) {
      const isDuplicate = locations.some(
        (l) => l.code && l.code.toUpperCase() === code.trim().toUpperCase()
      );
      if (isDuplicate) {
        newErrors.code = "This code is already in use";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await addLocation({
        name: name.trim(),
        type,
        code: code.trim() ? code.trim().toUpperCase() : undefined,
        address: address.trim(),
        is_active: isActive,
      });

      if (!created) {
        // RLS violation or backend error was already notified cleanly via toast in service layer
        setIsSubmitting(false);
        return;
      }

      resetForm();
      onOpenChange(false);
    } catch (err) {
      console.error("[AddLocationModal] Unhandled submission error:", err);
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <DialogContent className="sm:max-w-[540px] p-0 overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl backdrop-blur-md">
        {/* Modal Header */}
        <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#CC3333]/10 text-[#CC3333] flex items-center justify-center shrink-0 shadow-xs">
              <Store size={20} className="stroke-[2.2]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight">
                Add New Branch / Warehouse
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Register a new retail branch or storage warehouse into MediNist.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="px-6 py-5 space-y-4 text-left">
          {/* Branch / Warehouse Type Selection (Visually Distinct Cards) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Branch / Warehouse Type <span className="text-[#CC3333]">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Branch Option */}
              <button
                type="button"
                onClick={() => setType("branch")}
                className={cn(
                  "p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all",
                  type === "branch"
                    ? "border-[#CC3333] bg-[#CC3333]/5 ring-2 ring-[#CC3333]/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600"
                )}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center",
                      type === "branch"
                        ? "bg-[#CC3333] text-white"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    <Store size={15} />
                  </div>
                  {type === "branch" && (
                    <span className="text-[10px] font-bold text-[#CC3333] uppercase tracking-wider bg-[#CC3333]/10 px-1.5 py-0.5 rounded-md">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Retail Branch</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Point of Sale & patient dispensing center
                  </p>
                </div>
              </button>

              {/* Warehouse Option */}
              <button
                type="button"
                onClick={() => setType("warehouse")}
                className={cn(
                  "p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all",
                  type === "warehouse"
                    ? "border-amber-600 bg-amber-50/60 ring-2 ring-amber-500/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600"
                )}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center",
                      type === "warehouse"
                        ? "bg-amber-600 text-white"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    <Warehouse size={15} />
                  </div>
                  {type === "warehouse" && (
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider bg-amber-100 px-1.5 py-0.5 rounded-md">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Central Godown</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Bulk inventory depot & supply hub
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Name & Code in 2 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                {type === "warehouse" ? "Warehouse Name" : "Branch Name"} <span className="text-[#CC3333]">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={type === "branch" ? "e.g. North Lake Pharmacy" : "e.g. Eastern Central Depot"}
                  className={cn(
                    "w-full px-3 py-2 text-xs sm:text-sm rounded-xl border bg-white focus:outline-none focus:ring-2 transition-all",
                    errors.name
                      ? "border-rose-400 focus:ring-rose-200"
                      : "border-slate-200 focus:border-[#CC3333] focus:ring-[#CC3333]/20"
                  )}
                />
              </div>
              {errors.name && <p className="text-[11px] text-rose-600">{errors.name}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Hash size={12} className="text-slate-400" />
                Code <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={type === "branch" ? "NL-03" : "WH-02"}
                className={cn(
                  "w-full px-3 py-2 text-xs sm:text-sm rounded-xl border bg-white uppercase font-mono tracking-wider focus:outline-none focus:ring-2 transition-all",
                  errors.code
                    ? "border-rose-400 focus:ring-rose-200"
                    : "border-slate-200 focus:border-[#CC3333] focus:ring-[#CC3333]/20"
                )}
              />
              {errors.code && <p className="text-[11px] text-rose-600">{errors.code}</p>}
            </div>
          </div>

          {/* Physical Address */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
              <MapPin size={12} className="text-slate-400" />
              Address <span className="text-[#CC3333]">*</span>
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. House 14, Road 8, Block C, Gulshan-2, Dhaka"
              className={cn(
                "w-full px-3 py-2 text-xs sm:text-sm rounded-xl border bg-white focus:outline-none focus:ring-2 transition-all resize-none",
                errors.address
                  ? "border-rose-400 focus:ring-rose-200"
                  : "border-slate-200 focus:border-[#CC3333] focus:ring-[#CC3333]/20"
              )}
            />
            {errors.address && <p className="text-[11px] text-rose-600">{errors.address}</p>}
          </div>

          {/* Active Status Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-800">Operational Status</p>
              <p className="text-[11px] text-slate-500">
                {isActive ? "Facility is ready for dispensing and inventory operations" : "Facility is paused/archived"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-[11px] font-semibold px-2 py-0.5 rounded-md",
                  isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                )}
              >
                {isActive ? "Active" : "Inactive"}
              </span>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                className="data-[state=checked]:bg-[#CC3333]"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 sm:pt-4 flex flex-row gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#CC3333] hover:bg-[#B22222] text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 focus:ring-2 focus:ring-[#CC3333]/40"
            >
              <Sparkles size={13} />
              Save Branch / Warehouse
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
