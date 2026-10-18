import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Sparkles, Users, MessageSquare, Loader2, Store } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import NewGroupSheet from "@/components/messaging/NewGroupSheet";

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAI?: () => void;
}

interface RealStaffMember {
  id: string;
  name: string;
  initials: string;
  role: string;
  avatar_url?: string | null;
  assigned_location_id?: string | null;
  location_name?: string | null;
}

const getInitials = (name: string): string => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const NewChatModal: React.FC<NewChatModalProps> = ({
  isOpen,
  onClose,
  onSelectAI,
}) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { activeLocation } = useLocationStore();

  const [staffMembers, setStaffMembers] = useState<RealStaffMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [startingChatId, setStartingChatId] = useState<string | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState<boolean>(false);

  const effectiveRole = (profile?.role || "").toLowerCase().trim();
  const canCreateGroup = effectiveRole === "owner" || effectiveRole === "admin" || effectiveRole === "manager";

  // Fetch real staff strictly scoped to the active tenant/pharmacy
  const fetchStaff = useCallback(async () => {
    if (!profile?.pharmacy_id || !user?.id) {
      setStaffMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Try get_pharmacy_member_directory RPC first
      const { data: directoryData, error: rpcError } = await supabase
        .rpc("get_pharmacy_member_directory" as any, {
          _location_id: activeLocation?.id || null,
        });

      if (!rpcError && directoryData && Array.isArray(directoryData)) {
        const formatted: RealStaffMember[] = directoryData
          .filter((m: any) => m.id !== user.id)
          .map((m: any) => ({
            id: m.id,
            name: m.full_name || "Team Member",
            initials: getInitials(m.full_name || "TM"),
            role: m.role ? m.role.charAt(0).toUpperCase() + m.role.slice(1) : "Staff",
            avatar_url: m.avatar_url,
            assigned_location_id: m.assigned_location_id,
            location_name: m.location_name,
          }));

        setStaffMembers(formatted);
        setLoading(false);
        return;
      }

      // 2. Fallback to direct scoped query on public.profiles
      const { data: profilesData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role, assigned_location_id")
        .eq("pharmacy_id", profile.pharmacy_id)
        .neq("id", user.id);

      if (profileErr) {
        console.warn("[NewChatModal] Profiles fetch warning:", profileErr.message);
        setStaffMembers([]);
      } else if (profilesData) {
        const formatted: RealStaffMember[] = profilesData.map((p: any) => ({
          id: p.id,
          name: p.full_name || "Team Member",
          initials: getInitials(p.full_name || "TM"),
          role: p.role ? p.role.charAt(0).toUpperCase() + p.role.slice(1) : "Staff",
          avatar_url: p.avatar_url,
          assigned_location_id: p.assigned_location_id,
        }));

        setStaffMembers(formatted);
      }
    } catch (err) {
      console.error("[NewChatModal] Error fetching team members:", err);
      setStaffMembers([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.pharmacy_id, user?.id, activeLocation?.id]);

  useEffect(() => {
    if (isOpen) {
      fetchStaff();
    }
  }, [isOpen, fetchStaff]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isGroupModalOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isGroupModalOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Start 1-on-1 team chat
  const handleStartDirectChat = async (targetUserId: string) => {
    if (startingChatId) return;
    setStartingChatId(targetUserId);

    try {
      const { data: roomId, error } = await supabase.rpc("get_or_create_direct_room", {
        _other_user: targetUserId,
      });

      if (error) {
        console.error("[NewChatModal] Failed to get or create direct room:", error);
        toast.error(error.message || "Failed to start direct chat room.");
        setStartingChatId(null);
        return;
      }

      onClose();
      navigate(`/workspace/room/${roomId}`);
    } catch (err: any) {
      console.error("[NewChatModal] Unexpected chat initiation error:", err);
      toast.error("Could not initiate direct conversation.");
      setStartingChatId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        id="new-chat-modal-portal"
        className="fixed inset-0 z-50 flex items-end justify-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-modal-title"
      >
        {/* Backdrop: dark, semi-transparent overlay */}
        <div
          id="new-chat-modal-backdrop"
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
          aria-hidden="true"
        />

        {/* Container: Bottom Sheet with rounded top corners */}
        <div
          id="new-chat-bottom-sheet"
          className="relative z-10 w-full max-w-md bg-white rounded-t-3xl shadow-2xl border-t border-gray-100 overflow-hidden transform transition-all duration-300 animate-in slide-in-from-bottom max-h-[85vh] flex flex-col"
        >
          {/* Pull-Down Handle */}
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="h-1 w-10 rounded-full bg-gray-300/80" />
          </div>

          {/* Modal Header */}
          <div
            id="new-chat-modal-header"
            className="relative flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0"
          >
            <div className="flex items-center gap-2">
              <h2
                id="new-chat-modal-title"
                className="text-base font-bold text-gray-900 tracking-tight"
              >
                New chat
              </h2>
              {activeLocation?.name && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 truncate max-w-[150px]">
                  <Store className="h-2.5 w-2.5 shrink-0 text-[#CC3333]" />
                  <span className="truncate">{activeLocation.name}</span>
                </span>
              )}
            </div>

            <button
              id="new-chat-close-btn"
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* List Options */}
          <div
            id="new-chat-options-list"
            className="divide-y divide-gray-100 py-1 overflow-y-auto flex-1"
          >
            {/* Option 1: MediNist AI */}
            <button
              id="new-chat-option-ai"
              type="button"
              onClick={() => {
                onClose();
                onSelectAI?.();
              }}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100/70 cursor-pointer"
            >
              <div
                id="new-chat-avatar-ai"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 shadow-xs"
              >
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14.5px] font-bold text-blue-600 leading-snug">
                  MediNist AI
                </h3>
                <p className="text-[12.5px] text-gray-500 mt-0.5 truncate">
                  Your complete personal agent
                </p>
              </div>
            </button>

            {/* Option 2: New Group */}
            {canCreateGroup && (
              <button
                id="new-chat-option-group"
                type="button"
                onClick={() => setIsGroupModalOpen(true)}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100/70 cursor-pointer"
              >
                <div
                  id="new-chat-avatar-group"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 shadow-xs"
                >
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14.5px] font-bold text-gray-900 leading-snug">
                    New group
                  </h3>
                  <p className="text-[12.5px] text-gray-500 mt-0.5 truncate">
                    Create a team chat
                  </p>
                </div>
              </button>
            )}

            {/* Section Heading: Team Members */}
            <div className="px-4 pt-3 pb-1.5 bg-slate-50/70 border-t border-b border-gray-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Team Members ({staffMembers.length})
              </span>
            </div>

            {/* Loading Skeleton */}
            {loading && (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#CC3333]" />
                <p className="text-xs font-medium text-slate-500">
                  Loading verified team members...
                </p>
              </div>
            )}

            {/* Empty State: Zero Staff in Fresh Pharmacy */}
            {!loading && staffMembers.length === 0 && (
              <div className="py-8 px-6 text-center space-y-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <Users className="w-6 h-6 stroke-[1.8]" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  No team members in this branch yet
                </h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Only staff invited to your pharmacy will appear here. Add salespeople or managers from Staff Management to start chatting.
                </p>
              </div>
            )}

            {/* Real Staff Members (Strictly Isolated by Pharmacy) */}
            {!loading &&
              staffMembers.map((staff) => (
                <button
                  id={`new-chat-option-${staff.id}`}
                  key={staff.id}
                  type="button"
                  onClick={() => handleStartDirectChat(staff.id)}
                  disabled={startingChatId === staff.id}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100/70 cursor-pointer disabled:opacity-60"
                >
                  <div
                    id={`new-chat-avatar-${staff.id}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 border border-slate-200/80 text-slate-700 font-bold text-sm select-none overflow-hidden"
                  >
                    {staff.avatar_url ? (
                      <img
                        src={staff.avatar_url}
                        alt={staff.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      staff.initials
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14.5px] font-bold text-gray-900 leading-snug truncate">
                      {staff.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[12px] text-gray-500 capitalize">
                        {staff.role}
                      </span>
                      {staff.location_name && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 truncate max-w-[120px]">
                          {staff.location_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 pr-1">
                    {startingChatId === staff.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#CC3333]" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Group Creation Sheet */}
      <NewGroupSheet
        open={isGroupModalOpen}
        onOpenChange={(val) => {
          setIsGroupModalOpen(val);
          if (!val) {
            onClose();
          }
        }}
      />
    </>
  );
};

export default NewChatModal;
