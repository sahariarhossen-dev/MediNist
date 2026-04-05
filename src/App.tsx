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
import AI from "./pages/AI.tsx";
import More from "./pages/More.tsx";
import Inventory from "./pages/Inventory.tsx";
import AddProduct from "./pages/AddProduct.tsx";
import AddCompany from "./pages/AddCompany.tsx";
import CreateSale from "./pages/CreateSale.tsx";
import Invoice from "./pages/Invoice.tsx";
import ShortItems from "./pages/ShortItems.tsx";
import AppLayout from "./components/AppLayout.tsx";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (user) return <Navigate to="/" replace />;
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
            <Route path="/ai" element={<ProtectedRoute><AppLayout><AI /></AppLayout></ProtectedRoute>} />
            <Route path="/more" element={<ProtectedRoute><AppLayout><More /></AppLayout></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><AppLayout><Inventory /></AppLayout></ProtectedRoute>} />
            <Route path="/add-product" element={<ProtectedRoute><AddProduct /></ProtectedRoute>} />
            <Route path="/add-company" element={<ProtectedRoute><AddCompany /></ProtectedRoute>} />
            <Route path="/create-sale" element={<ProtectedRoute><CreateSale /></ProtectedRoute>} />
            <Route path="/invoice/:saleId" element={<ProtectedRoute><Invoice /></ProtectedRoute>} />
            <Route path="/short-items" element={<ProtectedRoute><ShortItems /></ProtectedRoute>} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
