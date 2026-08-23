import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DutyCard, { type DutySummary } from "@/components/staff/DutyCard";
import ApprovalQueue from "@/components/staff/ApprovalQueue";
import MonthlySummaryCard from "@/components/staff/MonthlySummaryCard";
import StaffPresenceStrip from "@/components/staff/StaffPresenceStrip";
import ActivityFeed, { type FeedStaffOption } from "@/components/staff/ActivityFeed";

const DutyControlCenter = ({
  nameOf,
  staffOptions = [],
  canControl,
}: {
  nameOf: (id: string) => string;
  staffOptions?: FeedStaffOption[];
  canControl: boolean;
}) => {
  const [userFilter, setUserFilter] = useState<string>("all");
  const [summary, setSummary] = useState<DutySummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadSummary = useCallback(async () => {
    const { data } = await supabase.rpc("get_staff_duty_summary" as any, {
      _user_id: userFilter === "all" ? null : userFilter,
    });
    setSummary((data as unknown as DutySummary) ?? null);
  }, [userFilter]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, refreshKey]);

  const bump = () => setRefreshKey((k) => k + 1);
  const selected = userFilter !== "all";

  return (
    <div className="space-y-3">
      <Select value={userFilter} onValueChange={setUserFilter}>
        <SelectTrigger className="w-full rounded-xl h-10 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <User size={14} className="text-muted-foreground shrink-0" />
            <SelectValue placeholder="Select staff member" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Staff</SelectItem>
          {staffOptions.map((s) => (
            <SelectItem key={s.user_id} value={s.user_id}>
              {s.full_name || "Member"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DutyCard
        summary={summary}
        staffName={selected ? nameOf(userFilter) : "Whole team"}
        userId={selected ? userFilter : null}
        canControl={canControl}
        onChanged={bump}
      />

      <ApprovalQueue userFilter={userFilter} refreshKey={refreshKey} onResolved={bump} />

      {selected && <MonthlySummaryCard summary={summary} />}

      {!selected && <StaffPresenceStrip userFilter={userFilter} />}

      <ActivityFeed nameOf={nameOf} userFilter={userFilter} refreshKey={refreshKey} />
    </div>
  );
};

export default DutyControlCenter;
