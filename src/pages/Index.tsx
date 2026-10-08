import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import BroadcastBanner from "@/components/BroadcastBanner";
import { ShopDashboard } from "@/components/dashboard/ShopDashboard";
import { WarehouseDashboard } from "@/components/dashboard/WarehouseDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const DashboardSkeleton = () => (
  <div className="px-page py-4 space-y-4 animate-pulse">
    <div className="flex items-center justify-between pt-2 pb-1">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-44 rounded-md" />
        <Skeleton className="h-4 w-56 rounded-md" />
      </div>
      <Skeleton className="h-8 w-24 rounded-lg" />
    </div>
    <div className="grid grid-cols-2 gap-3 py-2">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="p-4 border-0 shadow-sm rounded-xl bg-white space-y-3">
          <Skeleton className="w-9 h-9 rounded-full" />
          <Skeleton className="h-3.5 w-20 rounded" />
          <Skeleton className="h-6 w-28 rounded" />
        </Card>
      ))}
    </div>
    <Card className="p-4 border-0 shadow-sm rounded-3xl bg-white space-y-3">
      <Skeleton className="h-5 w-40 rounded" />
      <Skeleton className="h-44 w-full rounded-xl" />
    </Card>
  </div>
);

/**
 * Index: Lightweight Traffic Controller & Discriminator Router
 * Decoupled into <ShopDashboard /> and <WarehouseDashboard /> to eliminate
 * background query collisions, race conditions, and real-time subscription leaks.
 */
const Index = () => {
  const { profile } = useAuth();
  const { activeLocation, currentUserRole, isLoadingLocations } = useLocationStore();

  const effectiveRole = (currentUserRole || profile?.role || "").toLowerCase().trim();
  const isSalesmanRole = effectiveRole === "salesman";

  // Role Guard: Salesmen are strictly locked to retail branch views
  const isWarehouseView = !isSalesmanRole && activeLocation?.type === "warehouse";

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] max-w-md mx-auto pb-24">
      {/* Universal Broadcast Banner across all views */}
      <BroadcastBanner />

      {/* Loading Skeleton during Location Context initialization */}
      {isLoadingLocations ? (
        <DashboardSkeleton />
      ) : isWarehouseView ? (
        <WarehouseDashboard key={activeLocation?.id || "warehouse"} />
      ) : (
        <ShopDashboard key={activeLocation?.id || "shop"} />
      )}
    </div>
  );
};

export default Index;
