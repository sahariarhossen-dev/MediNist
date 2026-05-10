import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Store, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InvitationInfo {
  email: string;
  role: string;
  pharmacyName: string;
  status: string;
  expiresAt: string;
  isExpired: boolean;
}

const roleLabel = (r: string) =>
  r === "salesman" ? "Salesman" : r === "manager" ? "Manager" : r === "owner" ? "Owner" : r;

const AcceptInvitation = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This invitation link is missing a token.");
      setLoading(false);
      return;
    }
    (async () => {
      let info: any = null;
      let errorMsg: string | null = null;
      try {
        const url = `${SUPABASE_URL}/functions/v1/accept-invitation?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        info = await res.json();
        errorMsg = res.ok ? null : info?.error ?? "Failed to load invitation";
      } catch (e: any) {
        errorMsg = e?.message ?? "Failed to load invitation";
      }
      if (errorMsg || !info || info.error) {
        setError(errorMsg || info?.error || "Invitation not found");
      } else {
        setInvite(info as InvitationInfo);
      }
      setLoading(false);
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!invite || fullName.trim().length < 2 || password.length < 6) return;
    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("accept-invitation", {
        body: { token, fullName: fullName.trim(), password },
      });
      if (fnErr || data?.error) {
        toast.error(data?.error || fnErr?.message || "Failed to accept invitation");
        return;
      }
      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        toast.success(`Welcome to ${data.pharmacy?.name ?? "your pharmacy"}!`);
        navigate("/");
      }
    } catch (e: any) {
      toast.error(e.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Error / invalid / expired / accepted / revoked
  if (error || !invite || invite.isExpired || invite.status !== "pending") {
    const headline = !invite
      ? "Invitation not found"
      : invite.isExpired
      ? "Invitation expired"
      : invite.status === "accepted"
      ? "Invitation already used"
      : invite.status === "revoked"
      ? "Invitation revoked"
      : "Invitation unavailable";
    const detail = error
      ? error
      : invite?.isExpired
      ? "This invitation link is no longer valid. Please ask your shop admin to send a new one."
      : invite?.status === "accepted"
      ? "This invitation has already been accepted. Please sign in instead."
      : invite?.status === "revoked"
      ? "Your shop admin has revoked this invitation. Please contact them for a new one."
      : "Please ask your shop admin to send a new invitation.";

    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-blue-600 text-center mb-6">Medinist</h1>
          <Card className="p-6 border-0 shadow-lg rounded-2xl text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle size={22} className="text-amber-600" />
            </div>
            <h2 className="text-lg font-bold text-foreground">{headline}</h2>
            <p className="text-sm text-muted-foreground">{detail}</p>
            <Button
              className="w-full h-11 bg-blue-600 hover:bg-blue-700"
              onClick={() => navigate("/login")}
            >
              Go to Sign In
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Ready to accept
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-blue-600 text-center mb-6">Medinist</h1>
        <Card className="p-6 border-0 shadow-lg rounded-2xl">
          <div className="flex items-start gap-3 mb-5">
            <div className="p-2.5 rounded-xl bg-emerald-50">
              <Store size={20} className="text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">You've been invited to join</p>
              <p className="text-base font-bold text-foreground truncate">{invite.pharmacyName}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 capitalize text-[11px] rounded-md">
                  {roleLabel(invite.role)}
                </Badge>
                <span className="text-[11px] text-muted-foreground">on MediNist</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium">Email</label>
              <Input value={invite.email} disabled className="h-11 mt-1 bg-muted" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Full Name</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="h-11 mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Password</label>
              <div className="relative mt-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <Button
            className="w-full h-11 mt-5 bg-blue-600 hover:bg-blue-700 gap-2"
            disabled={submitting || fullName.trim().length < 2 || password.length < 6}
            onClick={handleAccept}
          >
            <Check size={16} />
            {submitting ? "Joining..." : "Create Account & Join"}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center mt-4">
            By joining, you agree to be added to {invite.pharmacyName}'s staff with the {roleLabel(invite.role)} role.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default AcceptInvitation;