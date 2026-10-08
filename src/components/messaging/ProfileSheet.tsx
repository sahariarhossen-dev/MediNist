import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, BadgeCheck, IdCard, Briefcase } from "lucide-react";
import { relativeTime } from "@/lib/relativeTime";

export interface ProfileMember {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: string | null;
  phone?: string | null;
  last_seen?: string | null;
  verified?: boolean;
}

const initials = (n: string | null | undefined) =>
  (n || "?").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

const humanRole = (r?: string | null) => {
  if (!r) return "Member";
  const normalized = r.toLowerCase().trim();
  switch (normalized) {
    case "owner":
    case "admin":
      return "Owner";
    case "manager":
      return "Manager";
    case "salesman":
      return "Salesman";
    default:
      return r.charAt(0).toUpperCase() + r.slice(1);
  }
};

const ProfileSheet = ({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  member: ProfileMember | null;
}) => {
  if (!member) return null;
  const memberId = `#${member.user_id.slice(0, 6).toUpperCase()}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle>Contact info</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col items-center px-4 pt-6 pb-4 bg-gray-50">
          <Avatar className="h-28 w-28 mb-3">
            {member.avatar_url ? <AvatarImage src={member.avatar_url} className="object-cover" /> : null}
            <AvatarFallback className="bg-blue-500 text-white text-2xl font-semibold">
              {initials(member.full_name)}
            </AvatarFallback>
          </Avatar>
          <h2 className="text-lg font-bold text-gray-900">{member.full_name || "Member"}</h2>
          {member.last_seen && (
            <p className="text-xs text-gray-500 mt-1">
              {Date.now() - new Date(member.last_seen).getTime() < 60_000
                ? "Online now"
                : `Last seen ${relativeTime(member.last_seen)}`}
            </p>
          )}
        </div>
        <div className="px-4 py-3 space-y-3">
          <Row icon={<Briefcase className="h-4 w-4 text-gray-500" />} label="Designation" value={humanRole(member.role)} />
          <Row icon={<IdCard className="h-4 w-4 text-gray-500" />} label="Member ID" value={memberId} mono />
          <Row
            icon={<Phone className="h-4 w-4 text-gray-500" />}
            label="Phone"
            value={
              member.phone ? (
                <a href={`tel:${member.phone}`} className="text-blue-600">
                  {member.phone}
                </a>
              ) : (
                "—"
              )
            }
          />
          <Row
            icon={<BadgeCheck className={`h-4 w-4 ${member.verified ? "text-emerald-500" : "text-gray-400"}`} />}
            label="Verified teammate"
            value={member.verified ? "Yes" : "No"}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Row = ({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) => (
  <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  </div>
);

export default ProfileSheet;