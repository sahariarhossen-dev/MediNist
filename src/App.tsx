import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
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
import StaffPerformanceDetails from "./pages/StaffPerformanceDetails.tsx";
import CatalogSearch from "./pages/CatalogSearch.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import AIAssistant from "./pages/AIAssistant.tsx";
import AcceptInvitation from "./pages/AcceptInvitation.tsx";
import DailyTransactions from "./pages/DailyTransactions.tsx";
import AllTransactions from "./pages/AllTransactions.tsx";
import PersonalReport from "./pages/PersonalReport.tsx";
import Customers from "./pages/Customers.tsx";
import CustomerProfile from "./pages/CustomerProfile.tsx";
import Notes from "./pages/Notes.tsx";
import NoteEditor from "./pages/NoteEditor.tsx";
import Messages from "./pages/Messages.tsx";
import ChatRoom from "./pages/ChatRoom.tsx";
import Subscription from "./pages/Subscription.tsx";
import SubscriptionCheckout from "./pages/SubscriptionCheckout.tsx";
import AppLayout from "./components/AppLayout.tsx";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isPasswordRecovery } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (isPasswordRecovery) return <Navigate to="/reset-password" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const BlockSalesman = ({ children }: { children: React.ReactNode }) => {
  const { profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (profile?.role === "salesman") return <Navigate to="/more" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<ProtectedRoute><AppLayout><Index /></AppLayout></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute><AppLayout><Sales /></AppLayout></ProtectedRoute>} />
            <Route path="/ai" element={<ProtectedRoute><AppLayout><AIAssistant /></AppLayout></ProtectedRoute>} />
            <Route path="/more" element={<ProtectedRoute><AppLayout><More /></AppLayout></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
            <Route path="/add-product" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
            <Route path="/add-company" element={<ProtectedRoute><AddCompany /></ProtectedRoute>} />
            <Route path="/create-sale" element={<ProtectedRoute><CreateSale /></ProtectedRoute>} />
            <Route path="/invoice/:saleId" element={<ProtectedRoute><Invoice /></ProtectedRoute>} />
            <Route path="/short-items" element={<ProtectedRoute><ShortItems /></ProtectedRoute>} />
            <Route path="/catalog-search" element={<ProtectedRoute><CatalogSearch /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/shop-profile" element={<ProtectedRoute><ShopProfile /></ProtectedRoute>} />
            <Route path="/staff/:userId" element={<ProtectedRoute><StaffPerformanceDetails /></ProtectedRoute>} />
            <Route path="/more/daily-transactions" element={<ProtectedRoute><BlockSalesman><DailyTransactions /></BlockSalesman></ProtectedRoute>} />
            <Route path="/more/all-transactions" element={<ProtectedRoute><BlockSalesman><AllTransactions /></BlockSalesman></ProtectedRoute>} />
            <Route path="/personal-report" element={<ProtectedRoute><BlockSalesman><PersonalReport /></BlockSalesman></ProtectedRoute>} />
            <Route path="/more/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
            <Route path="/more/customers/:id" element={<ProtectedRoute><CustomerProfile /></ProtectedRoute>} />
            <Route path="/more/notes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
            <Route path="/more/notes/:id" element={<ProtectedRoute><NoteEditor /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
