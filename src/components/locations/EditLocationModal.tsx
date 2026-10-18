import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Store, Warehouse, MapPin, Hash, Phone, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLocationStore } from "@/contexts/LocationContext";
import { Location, LocationType } from "@/types/location";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface EditLocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: Location | null;
}

export const EditLocationModal: React.FC<EditLocationModalProps> = ({
  open,
  onOpenChange,
  location,
}) => {
  const { updateLocation, locations } = useLocationStore();

  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("branch");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; address?: string; code?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLockPopup, setShowLockPopup] = useState(false);
  const lockPopupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Business Rule: A pharmacy must have > 1 facility to have a warehouse
  const totalFacilities = locations.length;
  const isSingleFacility = totalFacilities <= 1;
  const retailCount = locations.filter(
    (l) => l.type === "branch" || (l.type as string) === "shop"
  ).length;
  const isLastRetailBranch =
    (location?.type === "branch" || (location?.type as string) === "shop") &&
    retailCount <= 1;

  useEffect(() => {
    return () => {
      if (lockPopupTimeoutRef.current) clearTimeout(lockPopupTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (location) {
      setName(location.name || "");
      // If single facility, strictly force branch type
      if (isSingleFacility) {
        setType("branch");
      } else {
        setType(location.type || "branch");
      }
      setCode(location.code || "");
      setAddress(location.address || "");
      setPhone(location.phone || "");
      setIsActive(location.is_active !== false);
      setErrors({});
      setIsSubmitting(false);
      setShowLockPopup(false);
      if (lockPopupTimeoutRef.current) clearTimeout(lockPopupTimeoutRef.current);
    }
  }, [location, open, isSingleFacility]);

  const handleWarehouseClick = () => {
    if (isSingleFacility) {
      setShowLockPopup(true);
      if (lockPopupTimeoutRef.current) clearTimeout(lockPopupTimeoutRef.current);
      lockPopupTimeoutRef.current = setTimeout(() => {
        setShowLockPopup(false);
      }, 3500);
      toast.info("Single Branch Account: Multiple branches thaklei kebol warehouse switch kora jabe.");
      return;
    }
    if (isLastRetailBranch && location?.type === "branch") {
      setShowLockPopup(true);
      if (lockPopupTimeoutRef.current) clearTimeout(lockPopupTimeoutRef.current);
      lockPopupTimeoutRef.current = setTimeout(() => {
        setShowLockPopup(false);
      }, 3500);
      toast.info("At least one retail branch must be maintained for POS operations.");
      return;
    }
    setShowLockPopup(false);
    setType("warehouse");
  };

  const validate = () => {
    const newErrors: { name?: string; address?: string; code?: string; type?: string } = {};
    if (type === "warehouse" && isSingleFacility) {
      newErrors.type = "At least two branches are required to configure a warehouse.";
    }
    if (!name.trim()) {
      newErrors.name = type === "warehouse" ? "Warehouse name is required" : "Branch name is required";
    }
    if (!address.trim()) {
      newErrors.address = "Physical address is required";
    }
    if (code.trim() && location) {
      const isDuplicate = locations.some(
        (l) => l.id !== location.id && l.code && l.code.toUpperCase() === code.trim().toUpperCase()
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
    if (!location || !validate() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const success = await updateLocation(location.id, {
        name: name.trim(),
        type,
        code: code.trim() ? code.trim().toUpperCase() : undefined,
        address: address.trim(),
        phone: phone.trim() || undefined,
        is_active: isActive,
      });

      if (!success) {
        setIsSubmitting(false);
        return;
      }

      onOpenChange(false);
    } catch (err) {
      console.error("[EditLocationModal] Unexpected update error:", err);
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-white border border-slate-200 text-left p-6 rounded-2xl shadow-xl">
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              {type === "warehouse" ? <Warehouse size={16} /> : <Store size={16} />}
            </span>
            Edit Branch / Warehouse Details
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Update branch or warehouse facility records in the central directory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-2">
          {/* Facility Type Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between min-h-[22px]">
              <label className="text-xs font-semibold text-slate-700">Facility Type</label>
              {showLockPopup && (
                <div className="animate-in fade-in zoom-in-95 duration-200 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-full shadow-xs">
                  <Lock size={11} className="stroke-[2.5] text-amber-600 animate-pulse" />
                  <span>Single Branch Account</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowLockPopup(false);
                  setType("branch");
                }}
                className={cn(
                  "flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all",
                  type === "branch"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                <Store size={14} /> Retail Branch
              </button>
              <button
                type="button"
                onClick={handleWarehouseClick}
                className={cn(
                  "flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all relative",
                  isSingleFacility || (isLastRetailBranch && location?.type === "branch")
                    ? "bg-slate-50 text-slate-400 border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 cursor-pointer"
                    : type === "warehouse"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
                title={
                  isSingleFacility
                    ? "Single Branch Account: Click to see requirements"
                    : undefined
                }
              >
                {(isSingleFacility || (isLastRetailBranch && location?.type === "branch")) ? (
                  <Lock size={12} className="text-slate-400" />
                ) : (
                  <Warehouse size={14} />
                )}
                Warehouse
              </button>
            </div>
            {errors.type && <p className="text-[11px] text-rose-500">{errors.type}</p>}
          </div>

          {/* Location Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              {type === "warehouse" ? "Warehouse Name" : "Branch Name"} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="e.g. Dhanmondi Flagship or Central Storage"
              className={cn(
                "w-full px-3 py-2 text-xs rounded-xl border bg-slate-50/50 focus:bg-white focus:outline-none transition-all",
                errors.name
                  ? "border-rose-400 focus:border-rose-500"
                  : "border-slate-200 focus:border-blue-500"
              )}
            />
            {errors.name && <p className="text-[11px] text-rose-500">{errors.name}</p>}
          </div>

          {/* Code & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Hash size={12} className="text-slate-400" /> Short Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  if (errors.code) setErrors((prev) => ({ ...prev, code: undefined }));
                }}
                placeholder="e.g. DHN-01"
                maxLength={8}
                className={cn(
                  "w-full px-3 py-2 text-xs font-mono rounded-xl border bg-slate-50/50 focus:bg-white focus:outline-none transition-all uppercase",
                  errors.code
                    ? "border-rose-400 focus:border-rose-500"
                    : "border-slate-200 focus:border-blue-500"
                )}
              />
              {errors.code && <p className="text-[11px] text-rose-500">{errors.code}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Phone size={12} className="text-slate-400" /> Contact Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 01711223344"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Physical Address */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <MapPin size={12} className="text-slate-400" /> Physical Address
              </span>
              <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (errors.address) setErrors((prev) => ({ ...prev, address: undefined }));
              }}
              rows={2}
              placeholder="e.g. House 42, Road 7, Dhanmondi, Dhaka 1205"
              className={cn(
                "w-full px-3 py-2 text-xs rounded-xl border bg-slate-50/50 focus:bg-white focus:outline-none transition-all resize-none",
                errors.address
                  ? "border-rose-400 focus:border-rose-500"
                  : "border-slate-200 focus:border-blue-500"
              )}
            />
            {errors.address && <p className="text-[11px] text-rose-500">{errors.address}</p>}
          </div>

          {/* Operational Status */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 bg-slate-50/40">
            <div>
              <p className="text-xs font-bold text-slate-800">Operational Status</p>
              <p className="text-[11px] text-slate-500">
                {isActive ? "Facility is open for transactions" : "Facility is temporarily inactive"}
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter className="pt-2 flex flex-row items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
