import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import {
  getStoredSuspensionNotice,
  clearStoredSuspensionNotice,
} from "@/lib/accountSuspension";
import { AccountSuspendedModal } from "@/components/auth/AccountSuspendedModal";

const Login = () => {
  const navigate = useNavigate();
  const { user, isSuspended } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [suspendedModalData, setSuspendedModalData] = useState<{
    isOpen: boolean;
    reason: string | null;
  }>({
    isOpen: false,
    reason: null,
  });

  // Check if user was redirected here due to an active suspension
  useEffect(() => {
    const notice = getStoredSuspensionNotice();
    if (notice) {
      setSuspendedModalData({
        isOpen: true,
        reason: notice.reason || null,
      });
    }
  }, []);

  // Natural navigation: Navigate once AuthContext registers the authenticated user and verifies non-suspended
  useEffect(() => {
    if (user && !isSuspended) {
      clearStoredSuspensionNotice();
      navigate("/dashboard", { replace: true });
    }
  }, [user, isSuspended, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authError) {
        setError(authError.message || "Invalid login credentials");
        return;
      }

      if (!authData?.user) {
        setError("Unable to authenticate. Please check your credentials.");
        return;
      }

      // Authentication succeeded in Supabase.
      // AuthContext's onAuthStateChange handles session validation and suspension verification.
      // The useEffect hook above will redirect to /dashboard once state propagates.
      clearStoredSuspensionNotice();
    } catch (err: any) {
      console.error("[Login] Authentication exception:", err);
      setError(err?.message || "An unexpected error occurred during login. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6FB] flex items-center justify-center px-4">
      {/* Account Suspended Alert Modal */}
      <AccountSuspendedModal
        isOpen={suspendedModalData.isOpen}
        reason={suspendedModalData.reason}
        onClose={() => {
          setSuspendedModalData({ isOpen: false, reason: null });
          clearStoredSuspensionNotice();
        }}
      />

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-blue-600 tracking-tight">Medinist</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
        </div>

        <Card className="p-6 border-0 shadow-sm rounded-xl bg-white">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="text-right">
              <Link to="/forgot-password" className="text-sm text-gray-500 hover:text-blue-600 hover:underline">
                Forgot Password?
              </Link>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Don't have an account?{" "}
            <Link to="/register" className="text-blue-600 font-medium hover:underline">
              Register
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
};

export default Login;
