import React, { useEffect } from "react";
import { X, Sparkles, Users, MessageSquare } from "lucide-react";

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAI?: () => void;
}

interface StaffMemberOption {
  id: string;
  name: string;
  initials: string;
  role: string;
}

const STAFF_OPTIONS: StaffMemberOption[] = [
  {
    id: "staff-salman",
    name: "Salman F",
    initials: "SF",
    role: "Salesman",
  },
  {
    id: "staff-abir",
    name: "Abir Hossen",
    initials: "AH",
    role: "Salesman",
  },
];

export const NewChatModal: React.FC<NewChatModalProps> = ({
  isOpen,
  onClose,
  onSelectAI,
}) => {
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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

  if (!isOpen) return null;

  return (
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
        className="relative z-10 w-full max-w-md bg-white rounded-t-3xl shadow-2xl border-t border-gray-100 overflow-hidden transform transition-all duration-300 animate-in slide-in-from-bottom"
      >
        {/* Subtle Pull-Down Handle for Mobile */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-300/80" />
        </div>

        {/* Modal Header */}
        <div
          id="new-chat-modal-header"
          className="relative flex items-center justify-center px-4 py-3 border-b border-gray-100"
        >
          <h2
            id="new-chat-modal-title"
            className="text-base font-bold text-gray-900 tracking-tight"
          >
            New chat
          </h2>
          <button
            id="new-chat-close-btn"
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="absolute right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* List Options (Strict Order & Design) */}
        <div
          id="new-chat-options-list"
          className="divide-y divide-gray-100 py-1 pb-6 sm:pb-8"
        >
          {/* Option 1: MediNist AI (Top Priority) */}
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
          <button
            id="new-chat-option-group"
            type="button"
            onClick={onClose}
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

          {/* Option 3 & 4: Staff Members (Mock Data) */}
          {STAFF_OPTIONS.map((staff) => (
            <button
              id={`new-chat-option-${staff.id}`}
              key={staff.id}
              type="button"
              onClick={onClose}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100/70 cursor-pointer"
            >
              <div
                id={`new-chat-avatar-${staff.id}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 border border-gray-200/70 text-gray-700 font-bold text-sm select-none"
              >
                {staff.initials}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14.5px] font-bold text-gray-900 leading-snug">
                  {staff.name}
                </h3>
                <p className="text-[12.5px] text-gray-500 mt-0.5 truncate">
                  {staff.role}
                </p>
              </div>
              <div className="shrink-0 pr-1">
                <MessageSquare className="h-4 w-4 text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NewChatModal;
