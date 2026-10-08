import React from "react";
import { Navigate } from "react-router-dom";
import { useLocationStore } from "@/contexts/LocationContext";

interface RetailOnlyRouteProps {
  children: React.ReactNode;
  fallbackPath?: string;
}

/**
 * RetailOnlyRoute: Intelligent Route Guard preventing the "Trapped Navigation" bug.
 * If the user's activeLocation is a Warehouse or Godown, retail-only routes like /sales
 * or /create-sale are automatically redirected to warehouse equivalents (/transfers or /inventory).
 */
export const RetailOnlyRoute: React.FC<RetailOnlyRouteProps> = ({
  children,
  fallbackPath = "/transfers",
}) => {
  const { activeLocation, isLoadingLocations } = useLocationStore();

  if (isLoadingLocations) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const isWarehouse =
    activeLocation?.type === "warehouse" || (activeLocation?.type as string) === "godown";

  if (isWarehouse) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};

export default RetailOnlyRoute;
