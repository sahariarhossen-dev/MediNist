import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mail } from "lucide-react";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const getFriendlyError = (message: string) => {
    if (message.toLowerCase().includes("rate limit"))
      return "Too many requests. Please wait a few minutes before trying again.";
    if (message.toLowerCase().includes("redirect url not allowed"))
      return "Configuration error: redirect URL is not allowed. Please contact support.";
    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });

    if (error) {
      setError(getFriendlyError(error.message));
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F4F6FB] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-blue-600 tracking-tight">Medinist</h1>
          <p className="text-sm text-gray-500 mt-1">Reset your password</p>
        </div>

        <Card className="p-6 border-0 shadow-sm rounded-xl bg-white">
          {sent ? (
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Mail className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800">Check your inbox</h2>
              <p className="text-sm text-gray-500">
                A password reset link has been sent to your email. Please check your inbox and spam/junk folder.
              </p>
              <Link to="/login" className="inline-block text-sm text-blue-600 font-medium hover:underline mt-2">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
                <Input
                  type="email"
                  placeholder="Enter your registered email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>

              <Link to="/login" className="flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-blue-600 mt-2">
                Back to Sign In
              </Link>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
