import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, parseISO, startOfDay } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
} from "recharts";

const CircularProgress = ({ percent }: { percent: number }) => {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;

  return (
    <svg width="140" height="140" viewBox="0 0 128 128">
      <circle cx="64" cy="64" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
      <circle
        cx="64" cy="64" r={r} fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 64 64)"
        className="transition-all duration-700"
      />
      <text x="64" y="58" textAnchor="middle" className="fill-foreground text-2xl font-bold" fontSize="22">
        {percent}%
      </text>
      <text x="64" y="76" textAnchor="middle" className="fill-muted-foreground" fontSize="9">
        Achieved
      </text>
    </svg>
  );
};

const MiniTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg px-2 py-1 shadow text-xs">
      <p className="font-semibold">{label}</p>
      <p className="text-primary font-bold">৳{payload[0].value.toLocaleString()}</p>
    </div>
  );
};

const Profile = () => {
  const navigate = useNavigate();
  const { user, profile, pharmacyName, refreshProfile } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [chartData, setChartData] = useState<{ label: string; amount: number }[]>([]);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const memberId = user?.id ? user.id.slice(0, 8).toUpperCase() : "—";

  // Fetch 7-day personal sales
  const fetchMySales = useCallback(async () => {
    if (!user?.id || !profile?.pharmacy_id) return;
    const now = new Date();
    const start = subDays(startOfDay(now), 6);

    const { data: sales } = await supabase
      .from("sales")
      .select("total, created_at")
      .eq("pharmacy_id", profile.pharmacy_id)
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("created_at", start.toISOString());

    const grouped: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      grouped[format(subDays(now, i), "EEE")] = 0;
    }
    (sales ?? []).forEach((s) => {
      const key = format(parseISO(s.created_at), "EEE");
      if (key in grouped) grouped[key] += Number(s.total);
    });

    setChartData(Object.entries(grouped).map(([label, amount]) => ({ label, amount })));
  }, [user?.id, profile?.pharmacy_id]);

  useEffect(() => {
    fetchMySales();
  }, [fetchMySales]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 2MB allowed.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      await refreshProfile();
      toast({ title: "Avatar updated!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Monthly target (static demo)
  const monthlyTarget = 500000;
  const achievement = 400000;
  const percent = Math.round((achievement / monthlyTarget) * 100);

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={() => navigate("/", { replace: true })} className="p-2 rounded-full hover:bg-muted transition">
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">My Profile</h1>
      </div>

      {/* Avatar Upload */}
      <div className="flex flex-col items-center pt-2 pb-5">
        <div className="relative cursor-pointer" onClick={() => fileRef.current?.click()}>
          <Avatar className="h-28 w-28 border-4 border-primary shadow-lg">
            {profile?.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt="Avatar" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="absolute bottom-1 right-1 h-8 w-8 rounded-full bg-primary flex items-center justify-center shadow-md">
            <Camera size={14} className="text-primary-foreground" />
          </div>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
              <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        <p className="mt-3 text-base font-semibold text-foreground">{profile?.full_name || "User"}</p>
        <p className="text-xs text-muted-foreground">{pharmacyName || "—"}</p>
      </div>

      {/* Identity Card */}
      <div className="px-5 pb-4">
        <Card className="border-0 shadow-sm rounded-2xl bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">User Identity</h2>
          <div className="space-y-2.5">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Full Name</span>
              <span className="text-xs font-medium text-foreground">{profile?.full_name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Member ID</span>
              <span className="text-xs font-mono font-medium text-foreground">{memberId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Designation</span>
              <span className="text-xs font-medium text-foreground capitalize">{profile?.role || "Staff"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Phone</span>
              <span className="text-xs font-medium text-foreground">{profile?.phone || "—"}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Monthly Target */}
      <div className="px-5 pb-4">
        <Card className="border-0 shadow-sm rounded-2xl bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Monthly Target</h2>
          <div className="flex items-center gap-5">
            <CircularProgress percent={percent} />
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Target</p>
                <p className="text-sm font-bold text-foreground">৳{monthlyTarget.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Achievement</p>
                <p className="text-sm font-bold text-primary">৳{achievement.toLocaleString("en-IN")} ({percent}%)</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 7-Day Personal Sales */}
      <div className="px-5 pb-4">
        <Card className="border-0 shadow-sm rounded-2xl bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">My Sales — Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="myGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis hide />
              <Tooltip content={<MiniTooltip />} />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#myGrad)"
                dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
