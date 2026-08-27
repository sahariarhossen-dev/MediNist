import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";
import { usePharmacyStaff } from "@/hooks/usePharmacyStaff";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const initials = (n: string | null) =>
  (n || "?").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

const NewGroupSheet = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const navigate = useNavigate();
  const { staff } = usePharmacyStaff();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const create = async () => {
    if (!name.trim() || selected.size === 0) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_group_room", {
      _name: name.trim(),
      _member_ids: Array.from(selected),
      _avatar_url: null,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Could not create group", description: error.message, variant: "destructive" });
      return;
    }
    onOpenChange(false);
    setName("");
    setSelected(new Set());
    navigate(`/workspace/room/${data}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle>New group</SheetTitle>
        </SheetHeader>
        <div className="px-4 py-3 border-b">
          <Input
            placeholder="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
          <p className="text-xs text-gray-500 mt-2">
            {selected.size} member{selected.size === 1 ? "" : "s"} selected
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {staff.map((s) => {
            const isSel = selected.has(s.user_id);
            return (
              <button
                key={s.user_id}
                onClick={() => toggle(s.user_id)}
                className="flex w-full items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
              >
                <Avatar className="h-10 w-10">
                  {s.avatar_url ? <AvatarImage src={s.avatar_url} /> : null}
                  <AvatarFallback className="bg-blue-500 text-white text-xs font-semibold">
                    {initials(s.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-semibold text-sm text-gray-900">{s.full_name || "Member"}</p>
                  <p className="text-xs text-gray-500 capitalize">{s.role || "salesman"}</p>
                </div>
                <span
                  className={`h-6 w-6 rounded-full flex items-center justify-center border-2 ${
                    isSel ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
                  }`}
                >
                  {isSel && <Check className="h-4 w-4" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="border-t p-3">
          <Button
            onClick={create}
            disabled={busy || !name.trim() || selected.size === 0}
            className="w-full bg-green-500 hover:bg-green-600"
          >
            {busy ? "Creating…" : "Create group"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NewGroupSheet;