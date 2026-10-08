import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { LocationProvider } from "@/contexts/LocationContext";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Register from "./pages/Register.tsx";
import Login from "./pages/Login.tsx";
import Sales from "./pages/Sales.tsx";

import More from "./pages/More.tsx";
import Inventory from "./pages/Inventory.tsx";
import AddProduct from "./pages/AddProduct.tsx";
import AddCompany from "./pages/AddCompany.tsx";
import CreateSale from "./pages/CreateSale.tsx";
import Invoice from "./pages/Invoice.tsx";
import ShortItems from "./pages/ShortItems.tsx";
import Profile from "./pages/Profile.tsx";
import ShopProfile from "./pages/ShopProfile.tsx";
import StaffManagement from "./pages/StaffManagement.tsx";
import StaffPerformanceDetails from "./pages/StaffPerformanceDetails.tsx";
import LocationsPage from "./pages/Locations.tsx";
import CatalogSearch from "./pages/CatalogSearch.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";

import AcceptInvitation from "./pages/AcceptInvitation.tsx";
import DailyTransactions from "./pages/DailyTransactions.tsx";
import AllTransactions from "./pages/AllTransactions.tsx";
import PersonalReport from "./pages/PersonalReport.tsx";
import Customers from "./pages/Customers.tsx";
import CustomerProfile from "./pages/CustomerProfile.tsx";
import Notes from "./pages/Notes.tsx";
import NoteEditor from "./pages/NoteEditor.tsx";
import Workspace from "./pages/Workspace.tsx";
import AlertsThread from "./components/workspace/AlertsThread.tsx";
import ChatRoom from "./pages/ChatRoom.tsx";
import Subscription from "./pages/Subscription.tsx";
import SubscriptionCheckout from "./pages/SubscriptionCheckout.tsx";
import AppLayout from "./components/AppLayout.tsx";
import Landing from "./pages/Landing.tsx";
import Privacy from "./pages/Privacy.tsx";
import Terms from "./pages/Terms.tsx";
import Blog from "./pages/Blog.tsx";
import BlogPost from "./pages/BlogPost.tsx";
import { AccountSuspendedModal } from "./components/auth/AccountSuspendedModal.tsx";
import { RetailOnlyRoute } from "./components/auth/RoleRouteGuard.tsx";
import Suppliers from "./pages/procurement/Suppliers.tsx";
import PurchaseOrders from "./pages/procurement/PurchaseOrders.tsx";
import SmartRequisitions from "./pages/procurement/SmartRequisitions.tsx";
import SROrderPortal from "./pages/public/SROrderPortal.tsx";
import StockAudit from "./pages/warehouse/StockAudit.tsx";
import StockMovementsPage from "./pages/StockMovements.tsx";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isPasswordRecovery, isSuspended } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (isPasswordRecovery) return <Navigate to="/reset-password" replace />;
  if (isSuspended || !user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isSuspended } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (user && !isSuspended) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const BlockSalesman = ({ children }: { children: React.ReactNode }) => {
  const { profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  const role = (profile?.role || "").toLowerCase().trim();
  if (role === "salesman") return <Navigate to="/more" replace />;
  return <>{children}</>;
};

const RequireOwner = ({ children }: { children: React.ReactNode }) => {
  const { profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  const role = (profile?.role || "").toLowerCase().trim();
  if (role !== "owner") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const LandingRoute = () => {
  const { user, loading, isSuspended } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (user && !isSuspended) return <Navigate to="/dashboard" replace />;
  return <Landing />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <AccountSuspendedModal />
          <LocationProvider>
            <SubscriptionProvider>
          <Routes>
            <Route path="/" element={<LandingRoute />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/order/:token" element={<SROrderPortal />} />
            <Route path="/dashboard" element={<ProtectedRoute><AppLayout><Index /></AppLayout></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute><RetailOnlyRoute fallbackPath="/stock-movements?view=outbound"><AppLayout><Sales /></AppLayout></RetailOnlyRoute></ProtectedRoute>} />
            <Route path="/ai" element={<Navigate to="/workspace" replace />} />
            <Route path="/more" element={<ProtectedRoute><AppLayout><More /></AppLayout></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><AppLayout><Inventory /></AppLayout></ProtectedRoute>} />
            <Route path="/add-product" element={<ProtectedRoute><AppLayout><AddProduct /></AppLayout></ProtectedRoute>} />
            <Route path="/add-company" element={<ProtectedRoute><AppLayout><AddCompany /></AppLayout></ProtectedRoute>} />
            <Route path="/create-sale" element={<ProtectedRoute><RetailOnlyRoute fallbackPath="/stock-movements?view=outbound"><CreateSale /></RetailOnlyRoute></ProtectedRoute>} />
            <Route path="/invoice/:saleId" element={<ProtectedRoute><Invoice /></ProtectedRoute>} />
            <Route path="/short-items" element={<ProtectedRoute><AppLayout><ShortItems /></AppLayout></ProtectedRoute>} />
            <Route path="/catalog-search" element={<ProtectedRoute><AppLayout><CatalogSearch /></AppLayout></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
            <Route path="/shop-profile" element={<ProtectedRoute><AppLayout><ShopProfile /></AppLayout></ProtectedRoute>} />
            <Route path="/locations" element={<ProtectedRoute><RequireOwner><AppLayout><LocationsPage /></AppLayout></RequireOwner></ProtectedRoute>} />
            <Route path="/warehouses" element={<ProtectedRoute><RequireOwner><Navigate to="/locations" replace /></RequireOwner></ProtectedRoute>} />
            <Route path="/transfers" element={<Navigate to="/stock-movements?view=outbound" replace />} />
            <Route path="/stock-movements" element={<ProtectedRoute><AppLayout><StockMovementsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/procurement/suppliers" element={<ProtectedRoute><AppLayout><Suppliers /></AppLayout></ProtectedRoute>} />
            <Route path="/procurement/purchase-orders" element={<ProtectedRoute><AppLayout><PurchaseOrders /></AppLayout></ProtectedRoute>} />
            <Route path="/purchase-orders" element={<Navigate to="/procurement/purchase-orders" replace />} />
            <Route path="/procurement/smart-requisitions" element={<ProtectedRoute><AppLayout><SmartRequisitions /></AppLayout></ProtectedRoute>} />
            <Route path="/procurement/requisitions" element={<Navigate to="/procurement/smart-requisitions" replace />} />
            <Route path="/warehouse/requisitions" element={<Navigate to="/stock-movements?view=inbound" replace />} />
            <Route path="/branch/requisitions" element={<Navigate to="/stock-movements?view=inbound" replace />} />
            <Route path="/requisitions" element={<Navigate to="/stock-movements?view=inbound" replace />} />
            <Route path="/warehouse/audit" element={<ProtectedRoute><AppLayout><StockAudit /></AppLayout></ProtectedRoute>} />
            <Route path="/staff-management" element={<ProtectedRoute><AppLayout><StaffManagement /></AppLayout></ProtectedRoute>} />
            <Route path="/staff/:userId" element={<ProtectedRoute><AppLayout><StaffPerformanceDetails /></AppLayout></ProtectedRoute>} />
            <Route path="/more/daily-transactions" element={<ProtectedRoute><BlockSalesman><AppLayout><DailyTransactions /></AppLayout></BlockSalesman></ProtectedRoute>} />
            <Route path="/more/all-transactions" element={<ProtectedRoute><BlockSalesman><AppLayout><AllTransactions /></AppLayout></BlockSalesman></ProtectedRoute>} />
            <Route path="/personal-report" element={<ProtectedRoute><BlockSalesman><AppLayout><PersonalReport /></AppLayout></BlockSalesman></ProtectedRoute>} />
            <Route path="/more/customers" element={<ProtectedRoute><AppLayout><Customers /></AppLayout></ProtectedRoute>} />
            <Route path="/more/customers/:id" element={<ProtectedRoute><AppLayout><CustomerProfile /></AppLayout></ProtectedRoute>} />
            <Route path="/more/notes" element={<ProtectedRoute><AppLayout><Notes /></AppLayout></ProtectedRoute>} />
            <Route path="/more/notes/:id" element={<ProtectedRoute><NoteEditor /></ProtectedRoute>} />
            <Route path="/chat-list" element={<Workspace />} />
            <Route path="/workspace" element={<ProtectedRoute><AppLayout showHeader={false}><Workspace /></AppLayout></ProtectedRoute>} />
            <Route path="/workspace/ai/*" element={<Navigate to="/workspace" replace />} />

            <Route path="/workspace/alerts" element={<ProtectedRoute><AppLayout><AlertsThread /></AppLayout></ProtectedRoute>} />
            <Route path="/workspace/room/:roomId" element={<ProtectedRoute><ChatRoom /></ProtectedRoute>} />
            <Route path="/messages" element={<Navigate to="/workspace" replace />} />
            <Route path="/messages/:roomId" element={<ProtectedRoute><ChatRoom /></ProtectedRoute>} />
            <Route path="/subscription" element={<ProtectedRoute><AppLayout><Subscription /></AppLayout></ProtectedRoute>} />
            <Route path="/subscription/checkout" element={<ProtectedRoute><AppLayout><SubscriptionCheckout /></AppLayout></ProtectedRoute>} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
            </SubscriptionProvider>
          </LocationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
