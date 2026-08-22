import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Laptop, Lock, LogOut, Monitor, Smartphone, Tablet, Wifi, KeyRound,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { relativeTime } from "@/lib/relativeTime";
import { getSessionId } from "@/lib/deviceInfo";

interface SessionRow {
  id: string;
  user_id: string;
  session_id: string;
  os: string | null;
  browser: string | null;
  device_type: string | null;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

interface Settings {
  pin_lock_enabled: boolean;
  grace_seconds: number;
  ip_restriction_enabled: boolean;
  allowed_ip_hashes: string[];
}

const DEFAULTS: Settings = {
  pin_lock_enabled: false,
  grace_seconds: 60,
  ip_restriction_enabled: false,
  allowed_ip_hashes: [],
};

const deviceIcon = (t: string | null) =>
  t === "mobile" ? <Smartphone size={16} className="text-muted-foreground" />
  : t === "tablet" ? <Tablet size={16} className="text-muted-foreground" />
  : t === "desktop" ? <Monitor size={16} className="text-muted-foreground" />
  : <Laptop size={16} className="text-muted-foreground" />;

const SecurityPanel = ({ nameOf }: { nameOf: (id: string) => string }) => {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mySession = getSessionId();

  const load = useCallback(async () => {
    if (!profile?.pharmacy_id) return;
    const [{ data: sess }, { data: set }] = await Promise.all([
      supabase
        .from("staff_sessions" as any)
        .select("id,user_id,session_id,os,browser,device_type,first_seen_at,last_seen_at,revoked_at")
        .eq("pharmacy_id", profile.pharmacy_id)
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false }),
      supabase
        .from("staff_security_settings" as any)
        .select("pin_lock_enabled,grace_seconds,ip_restriction_enabled,allowed_ip_hashes")
        .eq("pharmacy_id", profile.pharmacy_id)
        .maybeSingle(),
    ]);
    setSessions(((sess as any[]) || []) as SessionRow[]);
    const row = set as any;
    setSettings(
      row
        ? {
            pin_lock_enabled: !!row.pin_lock_enabled,
            grace_seconds: Number(row.grace_seconds ?? 60),
            ip_restriction_enabled: !!row.ip_restriction_enabled,
            allowed_ip_hashes: (row.allowed_ip_hashes as string[]) || [],
          }
        : DEFAULTS,
    );
    setLoading(false);
  }, [profile?.pharmacy_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (patch: Partial<Settings>) => {
    if (!profile?.pharmacy_id) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    const { error } = await supabase.from("staff_security_settings" as any).upsert(
      {
        pharmacy_id: profile.pharmacy_id,
        pin_lock_enabled: next.pin_lock_enabled,
        grace_seconds: next.grace_seconds,
        ip_restriction_enabled: next.ip_restriction_enabled,
        allowed_ip_hashes: next.allowed_ip_hashes,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      } as any,
      { onConflict: "pharmacy_id" },
    );
    setSaving(false);
    if (error) {
      toast({ title: "Could not save setting", description: error.message, variant: "destructive" });
      void load();
    }
  };

  const addThisNetwork = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("session-guard", { body: { action: "whoami" } });
    setSaving(false);
    const hash = (data as any)?.ip_hash;
    if (error || !hash) {
      toast({ title: "Could not read this network", variant: "destructive" });
      return;
    }
    if (settings.allowed_ip_hashes.includes(hash)) {
      toast({ title: "This network is already allowed" });
      return;
    }
    await persist({ allowed_ip_hashes: [...settings.allowed_ip_hashes, hash] });
    toast({ title: "Network added", description: "Staff can sign in from this Wi-Fi." });
  };

  const revoke = async (row: SessionRow) => {
    const { error } = await supabase.rpc("revoke_staff_session" as any, { _session_id: row.session_id });
    if (error) {
      toast({ title: "Sign out failed", description: error.message, variant: "destructive" });
      return;
    }
    setSessions((prev) => prev.filter((s) => s.session_id !== row.session_id));
    toast({ title: "Device signed out", description: "It loses access within a minute." });
  };

  return (
    <div className="space-y-4">
      {/* Owner controls */}
      <div className="p-4 rounded-2xl bg-card border border-emerald-100 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Shop security</p>

        <div className="flex items-start gap-3">
          <Lock size={16} className="text-emerald-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Screen PIN lock</p>
            <p className="text-[11px] text-muted-foreground">
              Ask for a 4-digit PIN when the app is left in the background. Shift tracking keeps
              running either way.
            </p>
          </div>
          <Switch
            checked={settings.pin_lock_enabled}
            disabled={saving}
            onCheckedChange={(v) => void persist({ pin_lock_enabled: v })}
          />
        </div>

        {settings.pin_lock_enabled && (
          <div className="flex items-center gap-3 pl-7">
            <p className="text-xs text-muted-foreground flex-1">Grace period</p>
            <Select
              value={String(settings.grace_seconds)}
              onValueChange={(v) => void persist({ grace_seconds: Number(v) })}
            >
              <SelectTrigger className="h-9 w-28 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="30" className="text-xs">30 seconds</SelectItem>
                <SelectItem value="60" className="text-xs">1 minute</SelectItem>
                <SelectItem value="120" className="text-xs">2 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="h-px bg-border" />

        <div className="flex items-start gap-3">
          <Wifi size={16} className="text-emerald-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Restrict to shop network</p>
            <p className="text-[11px] text-muted-foreground">
              Only allow sign-in from the Wi-Fi networks you add here.
            </p>
          </div>
          <Switch
            checked={settings.ip_restriction_enabled}
            disabled={saving}
            onCheckedChange={(v) => void persist({ ip_restriction_enabled: v })}
          />
        </div>

        {settings.ip_restriction_enabled && (
          <div className="pl-7 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {settings.allowed_ip_hashes.length === 0 && (
                <p className="text-[11px] text-amber-700">
                  No network added yet — add this one before staff sign out.
                </p>
              )}
              {settings.allowed_ip_hashes.map((h) => (
                <Badge key={h} variant="secondary" className="text-[10px] font-mono">
                  {h.slice(0, 10)}…
                  <button
                    type="button"
                    className="ml-1.5 text-muted-foreground"
                    onClick={() =>
                      void persist({
                        allowed_ip_hashes: settings.allowed_ip_hashes.filter((x) => x !== h),
                      })
                    }
                    aria-label="Remove network"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={addThisNetwork} disabled={saving}>
              <Wifi size={13} className="mr-1.5" /> Add this network
            </Button>
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Active devices</p>
        {loading && <p className="text-sm text-muted-foreground text-center py-6">Loading devices…</p>}
        {!loading && sessions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No active devices recorded yet</p>
        )}
        {sessions.map((s) => {
          const isMine = s.session_id === mySession;
          const online = Date.now() - new Date(s.last_seen_at).getTime() < 3 * 60_000;
          return (
            <div key={s.id} className="p-3 bg-card rounded-2xl border border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-muted shrink-0">{deviceIcon(s.device_type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{nameOf(s.user_id)}</p>
                    {isMine && (
                      <Badge variant="secondary" className="text-[9px] rounded-md py-0 h-4">This device</Badge>
                    )}
                    {online && (
                      <Badge className="text-[9px] rounded-md py-0 h-4 bg-emerald-100 text-emerald-700 border-emerald-200">
                        Active now
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.browser || "Browser"} · {s.os || "Device"}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80">
                    {online ? "Online" : `Last active ${relativeTime(s.last_seen_at)}`}
                  </p>
                </div>
                {!isMine && (
                  <button
                    type="button"
                    onClick={() => void revoke(s)}
                    className="p-2 rounded-full hover:bg-destructive/10 shrink-0"
                    title="Sign out this device"
                    aria-label="Sign out this device"
                  >
                    <LogOut size={15} className="text-destructive" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 pt-1">
          <KeyRound size={12} className="mt-0.5 shrink-0" />
          Remote sign-out takes effect on the device within one minute. PIN lock protects the screen
          only; it is not a second sign-in factor.
        </p>
      </div>
    </div>
  );
};

export default SecurityPanel;
