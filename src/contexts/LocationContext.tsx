import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  Location,
  LocationContextType,
  UserRole,
  NewLocationInput,
  StockTransfer,
  NewStockTransferInput,
  TransferStatus,
} from "@/types/location";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { processAcceptTransfer, reconcileAcceptedTransfers } from "@/lib/stockTransferService";
import { toast } from "sonner";

const STORAGE_ACTIVE_KEY = "medinist_active_location_id";

const LocationContext = createContext<LocationContextType | undefined>(undefined);

// Safe empty placeholder when 0 locations exist
const EMPTY_FALLBACK_LOCATION: Location = {
  id: "",
  name: "Active Outlet",
  type: "branch",
  address: "",
  is_active: true,
};

// Helper to format PostgreSQL / Supabase RLS and permission errors cleanly
const parseLocationError = (error: any, action: "create" | "update" | "delete" | "toggle status"): string => {
  if (!error) return "";
  const code = String(error.code || "");
  const status = error.status || error.statusCode;
  const msg = String(error.message || "").toLowerCase();

  const isRlsOrForbidden =
    code === "42501" ||
    code === "PGRST301" ||
    status === 403 ||
    status === 401 ||
    msg.includes("row-level security") ||
    msg.includes("violates row-level security policy") ||
    msg.includes("permission denied") ||
    msg.includes("insufficient_privilege") ||
    msg.includes("not authorized");

  if (isRlsOrForbidden) {
    return `Access Denied: Only the pharmacy owner has administrative privileges to ${action} locations and warehouses.`;
  }

  return error.message || `An error occurred while attempting to ${action} the location.`;
};

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();

  // Fresh initial slate: strictly empty array
  const [locations, setLocations] = useState<Location[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState<boolean>(true);

  // Active location selection id
  const [activeLocationId, setActiveLocationId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_ACTIVE_KEY) || "";
    } catch {
      return "";
    }
  });

  // Fetch shop locations strictly from Supabase
  const fetchLocations = useCallback(async () => {
    if (!profile?.pharmacy_id) {
      setLocations([]);
      setIsLoadingLocations(false);
      return;
    }

    setIsLoadingLocations(true);
    try {
      const { data, error } = await supabase
        .from("shop_locations" as any)
        .select("*")
        .eq("pharmacy_id", profile.pharmacy_id)
        .order("created_at", { ascending: true });

      if (error) {
        console.warn("[LocationContext] Supabase shop_locations fetch error:", error.message);
        setLocations([]);
      } else if (data && Array.isArray(data) && data.length > 0) {
        const mapped: Location[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.type as "branch" | "warehouse",
          code: item.code || undefined,
          address: item.address || "",
          phone: item.phone || undefined,
          email: item.email || undefined,
          proprietor_name: item.proprietor_name || undefined,
          drug_license: item.drug_license || undefined,
          trade_license: item.trade_license || undefined,
          invoice_footer: item.invoice_footer || undefined,
          default_discount: item.default_discount !== null && item.default_discount !== undefined ? Number(item.default_discount) : undefined,
          logo_url: item.logo_url || undefined,
          cover_url: item.cover_url || undefined,
          is_active: item.is_active !== undefined ? item.is_active : true,
          is_main: !!item.is_main,
        }));
        setLocations(mapped);
      } else {
        // If no locations exist in Supabase yet, dynamically bootstrap from the parent pharmacy profile
        try {
          const { data: pharmacyRecord } = await supabase
            .from("pharmacies")
            .select("name, address")
            .eq("id", profile.pharmacy_id)
            .maybeSingle();

          const fallbackName = pharmacyRecord?.name?.trim() || "Main Branch";
          const fallbackAddress = pharmacyRecord?.address?.trim() || "";

          const { data: defaultBranch, error: insertErr } = await supabase
            .from("shop_locations" as any)
            .insert({
              pharmacy_id: profile.pharmacy_id,
              name: fallbackName,
              type: "branch",
              code: "MAIN",
              address: fallbackAddress,
              is_main: true,
              is_active: true,
            })
            .select()
            .single();

          if (!insertErr && defaultBranch) {
            const initialLoc: Location = {
              id: (defaultBranch as any).id,
              name: (defaultBranch as any).name || fallbackName,
              type: "branch",
              code: (defaultBranch as any).code || "MAIN",
              address: (defaultBranch as any).address || fallbackAddress,
              is_active: true,
              is_main: true,
            };
            setLocations([initialLoc]);
            setActiveLocationId(initialLoc.id);
            return;
          }
        } catch (bootstrapErr) {
          console.warn("[LocationContext] Could not auto-bootstrap default branch:", bootstrapErr);
        }
        setLocations([]);
      }
    } catch (err) {
      console.error("[LocationContext] Unexpected error fetching locations:", err);
      setLocations([]);
    } finally {
      setIsLoadingLocations(false);
    }
  }, [profile?.pharmacy_id]);

  // Fetch stock transfers strictly from Supabase
  const fetchTransfers = useCallback(async () => {
    if (!profile?.pharmacy_id) {
      setTransfers([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("stock_transfers" as any)
        .select(`
          id,
          created_at,
          from_location_id,
          to_location_id,
          medicine_id,
          medicine_name,
          generic_name,
          dosage,
          quantity,
          unit,
          status,
          note,
          created_by
        `)
        .eq("pharmacy_id", profile.pharmacy_id)
        .order("created_at", { ascending: false });

      if (!error && data && Array.isArray(data)) {
        const mapped: StockTransfer[] = data.map((t: any) => {
          const fromLoc = locations.find((l) => l.id === t.from_location_id);
          const toLoc = locations.find((l) => l.id === t.to_location_id);
          const formattedStatus = t.status
            ? ((t.status.charAt(0).toUpperCase() + t.status.slice(1).toLowerCase()) as TransferStatus)
            : "Pending";

          const noteStr = t.note || "";
          const refMatch =
            noteStr.match(/\[(?:Ref|Batch):\s*([A-Za-z0-9\-_]+)\]/i) ||
            noteStr.match(/\b(TR-BATCH-[A-Za-z0-9\-_]+)\b/i);
          const extractedRef = refMatch
            ? refMatch[1]
            : (t.reference_number || `TR-${t.id.slice(0, 6).toUpperCase()}`);

          return {
            id: t.id,
            date: t.created_at ? t.created_at.split("T")[0] : new Date().toISOString().split("T")[0],
            from_location_id: t.from_location_id,
            from_location_name: fromLoc?.name || "Origin Location",
            to_location_id: t.to_location_id,
            to_location_name: toLoc?.name || "Destination Location",
            medicine_id: t.medicine_id || undefined,
            medicine_name: t.medicine_name,
            generic_name: t.generic_name || undefined,
            dosage: t.dosage || undefined,
            quantity: Number(t.quantity) || 0,
            unit: t.unit || "pcs",
            status: formattedStatus,
            note: t.note || undefined,
            reference_number: extractedRef,
            created_at: t.created_at || new Date().toISOString(),
            created_by: t.created_by || undefined,
          };
        });
        setTransfers(mapped);

        // Retroactively reconcile any accepted transfers that might have missing destination inventory
        reconcileAcceptedTransfers(profile.pharmacy_id, locations).catch((err) => {
          console.warn("[LocationContext] Error in background transfer reconciliation:", err);
        });
      } else {
        setTransfers([]);
      }
    } catch (err) {
      console.warn("[LocationContext] Unexpected error fetching transfers:", err);
      setTransfers([]);
    }
  }, [profile?.pharmacy_id, locations]);

  // Initial fetch on mount & pharmacy change
  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Initial fetch transfers after locations load or pharmacy change
  useEffect(() => {
    if (profile?.pharmacy_id) {
      fetchTransfers();
    }
  }, [fetchTransfers, profile?.pharmacy_id]);

  // Auto-sync activeLocationId when locations list updates
  useEffect(() => {
    if (locations.length > 0) {
      const exists = locations.some((l) => l.id === activeLocationId);
      if (!exists) {
        const firstId = locations[0].id;
        setActiveLocationId(firstId);
        try {
          localStorage.setItem(STORAGE_ACTIVE_KEY, firstId);
        } catch {
          // ignore
        }
      }
    }
  }, [locations, activeLocationId]);

  // Role simulation override (defaults to logged-in user profile role or 'owner')
  const [mockRoleOverride, setMockRoleOverride] = useState<UserRole | null>(null);
  const normalizedRole = (profile?.role || "").toLowerCase().trim();
  const profileRole: UserRole =
    normalizedRole === "manager"
      ? "manager"
      : normalizedRole === "salesman"
      ? "salesman"
      : "owner";
  const currentUserRole: UserRole = mockRoleOverride || profileRole;

  // Derive active location without falling back to mock locations
  const activeLocation: Location =
    locations.find((l) => l.id === activeLocationId) ||
    locations[0] ||
    EMPTY_FALLBACK_LOCATION;

  const isWarehouse =
    activeLocation?.type === "warehouse" || (activeLocation?.type as string) === "godown";

  const setActiveLocation = useCallback(
    (id: string) => {
      const target = locations.find((l) => l.id === id);
      if (!target) {
        console.warn(`[LocationContext] Location not found for id: ${id}`);
        return;
      }

      setActiveLocationId(target.id);
      try {
        localStorage.setItem(STORAGE_ACTIVE_KEY, target.id);
      } catch {
        // ignore
      }

      // Ephemeral client-side context switch:
      // Note: We intentionally DO NOT overwrite profiles.assigned_location_id in Supabase here.
      // assigned_location_id represents a staff member's permanent operational posting,
      // whereas activeLocation represents the temporary viewing node in the UI session.
      console.log(`Global context switched to: ${target.name} (${target.id})`);
    },
    [locations]
  );

  const addLocation = useCallback(
    async (data: NewLocationInput): Promise<Location | null> => {
      if (!profile?.pharmacy_id) {
        toast.error("Unable to create location: No active pharmacy profile found.");
        return null;
      }

      try {
        const { data: inserted, error } = await supabase
          .from("shop_locations" as any)
          .insert({
            pharmacy_id: profile.pharmacy_id,
            name: data.name.trim(),
            type: data.type,
            code: data.code?.trim() || null,
            address: data.address.trim(),
            phone: data.phone?.trim() || null,
            is_active: data.is_active !== undefined ? data.is_active : true,
          })
          .select()
          .single();

        if (error) {
          console.warn("[LocationContext] Supabase insert error on shop_locations:", error);
          const friendlyMessage = parseLocationError(error, "create");
          toast.error(friendlyMessage);
          return null;
        }

        if (inserted) {
          const newLoc: Location = {
            id: (inserted as any).id,
            name: (inserted as any).name,
            type: (inserted as any).type as "branch" | "warehouse",
            code: (inserted as any).code || undefined,
            address: (inserted as any).address || "",
            phone: (inserted as any).phone || undefined,
            is_active: (inserted as any).is_active !== undefined ? (inserted as any).is_active : true,
          };

          setLocations((prev) => [...prev, newLoc]);
          toast.success(`${newLoc.name} (${newLoc.type === "branch" ? "Branch" : "Warehouse"}) created successfully.`);
          return newLoc;
        }
      } catch (err: any) {
        console.error("[LocationContext] Exception creating location in Supabase:", err);
        const friendlyMessage = parseLocationError(err, "create");
        toast.error(friendlyMessage);
        return null;
      }

      return null;
    },
    [profile?.pharmacy_id]
  );

  const updateLocation = useCallback(
    async (id: string, data: Partial<NewLocationInput>): Promise<boolean> => {
      if (!profile?.pharmacy_id) {
        toast.error("Unable to update location: No active pharmacy profile found.");
        return false;
      }

      const target = locations.find((l) => l.id === id);
      if (!target) return false;

      const updatePayload: Record<string, any> = {};
      if (data.name !== undefined) updatePayload.name = data.name.trim();
      if (data.type !== undefined) updatePayload.type = data.type;
      if (data.code !== undefined) updatePayload.code = data.code.trim() || null;
      if (data.address !== undefined) updatePayload.address = data.address.trim();
      if (data.phone !== undefined) updatePayload.phone = data.phone?.trim() || null;
      if (data.email !== undefined) updatePayload.email = data.email?.trim() || null;
      if (data.proprietor_name !== undefined) updatePayload.proprietor_name = data.proprietor_name?.trim() || null;
      if (data.drug_license !== undefined) updatePayload.drug_license = data.drug_license?.trim() || null;
      if (data.trade_license !== undefined) updatePayload.trade_license = data.trade_license?.trim() || null;
      if (data.invoice_footer !== undefined) updatePayload.invoice_footer = data.invoice_footer?.trim() || null;
      if (data.default_discount !== undefined) updatePayload.default_discount = data.default_discount;
      if (data.logo_url !== undefined) updatePayload.logo_url = data.logo_url;
      if (data.cover_url !== undefined) updatePayload.cover_url = data.cover_url;
      if (data.is_active !== undefined) updatePayload.is_active = data.is_active;

      try {
        const { error } = await supabase
          .from("shop_locations" as any)
          .update(updatePayload)
          .eq("id", id)
          .eq("pharmacy_id", profile.pharmacy_id);

        if (error) {
          console.warn("[LocationContext] Supabase update error on shop_locations:", error);
          const friendlyMessage = parseLocationError(error, "update");
          toast.error(friendlyMessage);
          return false;
        }

        setLocations((prev) =>
          prev.map((loc) => (loc.id === id ? { ...loc, ...data } : loc))
        );
        toast.success("Location details updated successfully.");
        return true;
      } catch (err: any) {
        console.error("[LocationContext] Exception updating location in Supabase:", err);
        const friendlyMessage = parseLocationError(err, "update");
        toast.error(friendlyMessage);
        return false;
      }
    },
    [locations, profile?.pharmacy_id]
  );

  const deleteLocation = useCallback(
    async (id: string): Promise<boolean> => {
      if (!profile?.pharmacy_id) {
        toast.error("Unable to delete location: No active pharmacy profile found.");
        return false;
      }

      const target = locations.find((l) => l.id === id);
      if (!target) return false;

      if (locations.length <= 1) {
        toast.error("Cannot delete the only location. At least one branch must remain active.");
        return false;
      }

      try {
        const { error } = await supabase
          .from("shop_locations" as any)
          .delete()
          .eq("id", id)
          .eq("pharmacy_id", profile.pharmacy_id);

        if (error) {
          console.warn("[LocationContext] Supabase delete error on shop_locations:", error);
          const friendlyMessage = parseLocationError(error, "delete");
          toast.error(friendlyMessage);
          return false;
        }

        setLocations((prev) => prev.filter((loc) => loc.id !== id));
        if (activeLocationId === id) {
          const remaining = locations.filter((loc) => loc.id !== id);
          if (remaining[0]) {
            setActiveLocationId(remaining[0].id);
          }
        }
        toast.success(`${target.name} removed successfully.`);
        return true;
      } catch (err: any) {
        console.error("[LocationContext] Exception deleting location from Supabase:", err);
        const friendlyMessage = parseLocationError(err, "delete");
        toast.error(friendlyMessage);
        return false;
      }
    },
    [locations, activeLocationId, profile?.pharmacy_id]
  );

  const toggleLocationStatus = useCallback(
    async (id: string): Promise<boolean> => {
      if (!profile?.pharmacy_id) {
        toast.error("Unable to update location status: No active pharmacy profile found.");
        return false;
      }

      const target = locations.find((l) => l.id === id);
      if (!target) return false;

      const newStatus = target.is_active === false ? true : false;

      try {
        const { error } = await supabase
          .from("shop_locations" as any)
          .update({ is_active: newStatus })
          .eq("id", id)
          .eq("pharmacy_id", profile.pharmacy_id);

        if (error) {
          console.warn("[LocationContext] Supabase update status error on shop_locations:", error);
          const friendlyMessage = parseLocationError(error, "toggle status");
          toast.error(friendlyMessage);
          return false;
        }

        setLocations((prev) =>
          prev.map((loc) => (loc.id === id ? { ...loc, is_active: newStatus } : loc))
        );
        toast.info(`${target.name} marked as ${newStatus ? "Active" : "Inactive"}`);
        return true;
      } catch (err: any) {
        console.error("[LocationContext] Exception updating location status in Supabase:", err);
        const friendlyMessage = parseLocationError(err, "toggle status");
        toast.error(friendlyMessage);
        return false;
      }
    },
    [locations, profile?.pharmacy_id]
  );

  const initiateTransfer = useCallback(
    async (data: NewStockTransferInput): Promise<StockTransfer> => {
      const now = new Date();
      const createdAt = data.created_at || now.toISOString();
      const dateStr = createdAt.split("T")[0];
      const tempId = `tr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const refNumber =
        data.reference_number || `TR-${tempId.slice(3, 9).toUpperCase()}`;

      // Persistently embed reference number in note so it survives across sessions and reloads
      let finalNote = data.note ? data.note.trim() : "";
      if (refNumber && !finalNote.includes(refNumber)) {
        finalNote = finalNote
          ? `[Ref: ${refNumber}] ${finalNote}`
          : `[Ref: ${refNumber}]`;
      }

      const newTransfer: StockTransfer = {
        id: tempId,
        date: dateStr,
        from_location_id: data.from_location_id,
        from_location_name: data.from_location_name,
        to_location_id: data.to_location_id,
        to_location_name: data.to_location_name,
        medicine_id: data.medicine_id,
        medicine_name: data.medicine_name,
        generic_name: data.generic_name,
        dosage: data.dosage,
        quantity: data.quantity,
        unit: data.unit || "pcs",
        status: "Pending",
        note: finalNote || undefined,
        reference_number: refNumber,
        created_at: createdAt,
        created_by: profile?.full_name || "Pharmacist / Operator",
      };

      if (profile?.pharmacy_id) {
        try {
          const { data: inserted, error } = await supabase
            .from("stock_transfers" as any)
            .insert({
              pharmacy_id: profile.pharmacy_id,
              from_location_id: data.from_location_id,
              to_location_id: data.to_location_id,
              medicine_id: data.medicine_id || null,
              medicine_name: data.medicine_name,
              generic_name: data.generic_name || null,
              dosage: data.dosage || null,
              quantity: data.quantity,
              unit: data.unit || "pcs",
              status: "pending",
              note: finalNote || null,
              created_at: createdAt,
              created_by: profile?.id || null,
            })
            .select()
            .single();

          if (!error && inserted) {
            newTransfer.id = (inserted as any).id;
          }
        } catch (err) {
          console.warn("[LocationContext] Error inserting transfer to Supabase:", err);
        }
      }

      setTransfers((prev) => [newTransfer, ...prev]);
      return newTransfer;
    },
    [profile]
  );

  const acceptTransfer = useCallback(
    async (id: string) => {
      try {
        const transfer = transfers.find((t) => t.id === id);
        const result = await processAcceptTransfer(
          id,
          profile?.pharmacy_id || undefined,
          profile?.id || undefined,
          transfer,
          locations
        );

        // Immediately re-fetch transfer history and locations/inventory
        await fetchTransfers();
        await fetchLocations();

        toast.success("Transfer accepted and stock updated safely.");
        return result;
      } catch (err: any) {
        console.error("[LocationContext] Failed to accept transfer:", err);
        await fetchTransfers();
        throw err;
      }
    },
    [transfers, profile?.pharmacy_id, profile?.id, locations, fetchTransfers, fetchLocations]
  );

  const updateTransferStatus = useCallback(
    async (id: string, status: TransferStatus) => {
      if (status.toLowerCase() === "accepted") {
        return acceptTransfer(id);
      }

      setTransfers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status } : t))
      );

      if (profile?.pharmacy_id) {
        try {
          await supabase
            .from("stock_transfers" as any)
            .update({ status: status.toLowerCase() })
            .eq("id", id)
            .eq("pharmacy_id", profile.pharmacy_id);
        } catch (err) {
          console.warn("[LocationContext] Error updating transfer status:", err);
        }
      }
    },
    [profile?.pharmacy_id, acceptTransfer]
  );

  const rejectTransfer = useCallback(
    (id: string) => {
      updateTransferStatus(id, "Rejected");
    },
    [updateTransferStatus]
  );

  return (
    <LocationContext.Provider
      value={{
        locations,
        activeLocation,
        setActiveLocation,
        addLocation,
        updateLocation,
        deleteLocation,
        toggleLocationStatus,
        currentUserRole,
        setCurrentUserRole: setMockRoleOverride,
        isMultiLocation: locations.length > 1,
        transfers,
        initiateTransfer,
        acceptTransfer,
        rejectTransfer,
        updateTransferStatus,
        isLoadingLocations,
        refetchLocations: fetchLocations,
        isWarehouse,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocationStore = (): LocationContextType => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocationStore must be used within a LocationProvider");
  }
  return context;
};

export const useLocationContext = useLocationStore;
export default LocationContext;
