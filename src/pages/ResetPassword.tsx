import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const getPasswordStrength = (pw: string) => {
  if (!pw || pw.length < 6) return { label: "Weak", color: "text-red-500", barColor: "bg-red-500", percent: 33 };
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  if (pw.length >= 10 && hasUpper && hasLower && hasNumber && hasSpecial)
    return { label: "Strong", color: "text-green-500", barColor: "bg-green-500", percent: 100 };
  if (pw.length >= 8 && ((hasUpper || hasLower) && hasNumber))
    return { label: "Normal", color: "text-yellow-500", barColor: "bg-yellow-500", percent: 66 };
  return { label: "Weak", color: "text-red-500", barColor: "bg-red-500", percent: 33 };
};

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    // Also check if already in recovery state via hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    }
    return () => subscription.unsubscribe();
  }, []);

  const strength = getPasswordStrength(password);
  const canUpdate = strength.label !== "Weak";

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully!");
      navigate("/");
    }
    setLoading(false);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-500">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-blue-600 tracking-tight">Medinist</h1>
          <p className="text-sm text-gray-500 mt-1">Set your new password</p>
        </div>

        <Card className="p-6 border-0 shadow-sm rounded-xl bg-white">
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">New Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter new password"
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

            {password && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${strength.color}`}>
                    Strength: {strength.label}
                  </span>
                </div>
                <Progress
                  value={strength.percent}
                  className="h-1.5"
                  style={{
                    background: "#e5e7eb",
                  }}
                />
                <style>{`
                  [role="progressbar"] > div {
                    background: ${
                      strength.label === "Strong" ? "#22c55e" :
                      strength.label === "Normal" ? "#eab308" : "#ef4444"
                    } !important;
                  }
                `}</style>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={loading || !canUpdate}
            >
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
