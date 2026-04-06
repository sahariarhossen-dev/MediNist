import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Pencil, LogOut, ShieldCheck, X, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

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

const Profile = () => {
  const navigate = useNavigate();
  const { user, profile, pharmacyName, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const memberId = user?.id ? user.id.slice(0, 8).toUpperCase() : "—";

  const startEditing = () => {
    setEditName(profile?.full_name || "");
    setEditPhone(profile?.phone || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: editName.trim() || null, phone: editPhone.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      setEditing(false);
      toast({ title: "Profile updated!" });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

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

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">User Identity</h2>
            {!editing ? (
              <button onClick={startEditing} className="p-1.5 rounded-full hover:bg-muted transition">
                <Pencil size={14} className="text-muted-foreground" />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={cancelEditing} className="p-1.5 rounded-full hover:bg-muted transition">
                  <X size={14} className="text-muted-foreground" />
                </button>
                <button onClick={saveProfile} disabled={saving} className="p-1.5 rounded-full hover:bg-primary/10 transition">
                  <Check size={14} className="text-primary" />
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Full Name</span>
              {editing ? (
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 w-40 text-xs text-right" />
              ) : (
                <span className="text-xs font-medium text-foreground">{profile?.full_name || "—"}</span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Member ID</span>
              <span className="text-xs font-mono font-medium text-foreground">{memberId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Designation</span>
              <span className="text-xs font-medium text-foreground capitalize">{profile?.role || "Staff"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Phone</span>
              {editing ? (
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="h-7 w-40 text-xs text-right" />
              ) : (
                <span className="text-xs font-medium text-foreground">{profile?.phone || "—"}</span>
              )}
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

      {/* Security */}
      <div className="px-5 pb-4">
        <Card className="border-0 shadow-sm rounded-2xl bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Security</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">2-Step Verification</p>
                <p className="text-[11px] text-muted-foreground leading-tight">Protect your account with an extra layer of security.</p>
              </div>
            </div>
            <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
          </div>
        </Card>
      </div>

      {/* Logout */}
      <div className="px-5 pb-6">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-3 bg-destructive/10 rounded-2xl p-4 hover:bg-destructive/20 transition-colors"
        >
          <LogOut size={20} className="text-destructive" />
          <span className="font-semibold text-destructive">Log Out</span>
        </button>
      </div>
    </div>
  );
};

export default Profile;
