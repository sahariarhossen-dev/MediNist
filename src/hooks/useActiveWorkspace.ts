import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocationStore } from '@/contexts/LocationContext';

export interface ActiveWorkspace {
  pharmacyId: string;       // Root Tenant Organization ID (public.pharmacies.id)
  branchId: string;         // Active Outlet / Location ID (public.shop_locations.id)
  orgName: string;          // Root Org Name (e.g. "City Shop")
  branchName: string;       // Active Outlet Trade Name (e.g. "Fahim Medical Hall (MAIN)")
  branchCode?: string;      // e.g. "MAIN", "DHM"
  branchAddress: string;    // Physical address of this specific branch
  branchPhone?: string;     // Contact number of this specific branch
  isMainBranch: boolean;    // Whether this outlet is the headquarters / main branch
  isWarehouse: boolean;     // Godown/Warehouse vs retail pharmacy
  isLoading: boolean;       // Loading state of profile or location
}

export const useActiveWorkspace = (): ActiveWorkspace => {
  const { profile, pharmacyName, loading: authLoading } = useAuth();
  const locationStore = useLocationStore();
  const activeLocation = locationStore.activeLocation;
  const locationLoading = Boolean(locationStore.isLoadingLocations);

  return useMemo(() => {
    const rootPharmacyId = profile?.pharmacy_id || '';
    const rootOrgName = pharmacyName || profile?.pharmacies?.name || 'MediNist Pharmacy';

    const branchId = activeLocation?.id || '';
    const branchName = activeLocation?.name || rootOrgName;
    const branchAddress = activeLocation?.address || '';
    const branchPhone = activeLocation?.phone || '';
    const branchCode = activeLocation?.code || undefined;
    const isMainBranch = Boolean(activeLocation?.is_main);
    const isWarehouse = activeLocation?.type === 'warehouse' || (activeLocation?.type as string) === 'godown';

    return {
      pharmacyId: rootPharmacyId,
      branchId,
      orgName: rootOrgName,
      branchName,
      branchCode,
      branchAddress,
      branchPhone,
      isMainBranch,
      isWarehouse,
      isLoading: authLoading || locationLoading,
    };
  }, [profile, pharmacyName, activeLocation, authLoading, locationLoading]);
};
