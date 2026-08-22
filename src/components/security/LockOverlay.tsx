import { useEffect, useState } from "react";
import { Delete, Lock, LogOut, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";

interface Props {
  mode: "unlock" | "setup";
  onUnlocked: () => void;
  onPinCreated: () => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

const LockOverlay = ({ mode, onUnlocked, onPinCreated }: Props) => {
  const { profile, pharmacyName, signOut } = useAuth();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);

  const value = stage === "confirm" ? confirmPin : pin;
  const setValue = stage === "confirm" ? setConfirmPin : setPin;

  const fail = (title: string, description?: string) => {
    setShake(true);
    window.setTimeout(() => setShake(false), 420);
    if (navigator.vibrate) navigator.vibrate(60);
    setPin("");
    setConfirmPin("");
    setStage("enter");
    toast({ title, description, variant: "destructive" });
  };

  useEffect(() => {
    if (value.length !== 4 || busy) return;

    const run = async () => {
      setBusy(true);
      if (mode === "setup") {
        if (stage === "enter") {
          setStage("confirm");
          setBusy(false);
          return;
        }
        if (confirmPin !== pin) {
          setBusy(false);
          fail("PINs do not match", "Please choose your 4-digit PIN again.");
          return;
        }
        const { error } = await supabase.rpc("set_staff_pin" as any, { _pin: pin });
        setBusy(false);
        if (error) {
          fail("Could not save PIN", error.message);
          return;
        }
        toast({ title: "PIN set", description: "You'll use this to unlock the screen." });
        onPinCreated();
        return;
      }

      const { data, error } = await supabase.rpc("verify_staff_pin" as any, { _pin: pin });
      setBusy(false);
      if (error) {
        fail("Unlock failed", error.message);
        return;
      }
      const res = data as any;
      if (res?.ok) {
        setPin("");
        onUnlocked();
        return;
      }
      if (res?.reason === "locked") {
        setLockedMsg("Too many attempts. Try again in a few minutes or sign out.");
        fail("Temporarily locked", "5 wrong attempts — wait 15 minutes.");
        return;
      }
      fail("Wrong PIN", res?.failures ? `${5 - Number(res.failures)} attempts left.` : undefined);
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const press = (k: string) => {
    if (busy) return;
    if (k === "del") {
      setValue(value.slice(0, -1));
      return;
    }
    if (!k || value.length >= 4) return;
    setValue(value + k);
  };

  const initials = (profile?.full_name || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const title =
    mode === "setup"
      ? stage === "enter"
        ? "Create your unlock PIN"
        : "Confirm your PIN"
      : "Screen locked";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 bg-background/80 backdrop-blur-xl">
      <div className="w-full max-w-xs flex flex-col items-center">
        <div className="p-2.5 rounded-2xl bg-emerald-100 mb-4">
          {mode === "setup" ? (
            <ShieldCheck size={22} className="text-emerald-700" />
          ) : (
            <Lock size={22} className="text-emerald-700" />
          )}
        </div>

        <Avatar className="h-16 w-16 mb-3 ring-2 ring-emerald-200">
          <AvatarImage src={profile?.avatar_url || undefined} />
          <AvatarFallback className="bg-emerald-100 text-emerald-700 text-lg font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <p className="text-base font-bold text-foreground">{profile?.full_name || "Team member"}</p>
        <p className="text-xs text-muted-foreground mb-1">{pharmacyName || "Your shop"}</p>
        <p className="text-sm font-medium text-foreground mt-3">{title}</p>
        <p className="text-[11px] text-muted-foreground mb-5 text-center">
          {mode === "setup"
            ? "Used only to unlock this screen — your work stays exactly where it is."
            : "Your open sale is safe. Enter your 4-digit PIN to continue."}
        </p>

        <div className={`flex items-center gap-4 mb-7 ${shake ? "animate-[shake_0.4s]" : ""}`}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-all ${
                value.length > i ? "bg-emerald-600 scale-110" : "bg-muted border border-border"
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 w-full">
          {KEYS.map((k, i) =>
            k === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => press(k)}
                disabled={busy}
                aria-label={k === "del" ? "Delete" : k}
                className="h-14 rounded-2xl bg-card border border-border text-xl font-semibold text-foreground active:scale-95 active:bg-muted transition disabled:opacity-50 flex items-center justify-center"
              >
                {k === "del" ? <Delete size={18} className="text-muted-foreground" /> : k}
              </button>
            ),
          )}
        </div>

        {lockedMsg && <p className="text-[11px] text-destructive mt-4 text-center">{lockedMsg}</p>}

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut size={13} /> Sign out instead
        </button>
      </div>
    </div>
  );
};

export default LockOverlay;
