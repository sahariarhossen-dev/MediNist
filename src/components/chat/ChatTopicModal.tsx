import React, { useEffect, useRef, useCallback } from "react";

interface ChatTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatTopic: string;
  setChatTopic: (topic: string) => void;
  onStartChat: (topic: string) => void;
}

const SUGGESTIONS = ["Daily Sales", "Low Stock", "Staff Report"];

export const ChatTopicModal: React.FC<ChatTopicModalProps> = ({
  isOpen,
  onClose,
  chatTopic,
  setChatTopic,
  onStartChat,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCancel = useCallback(() => {
    setChatTopic("");
    onClose();
  }, [setChatTopic, onClose]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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

  // Optional: Escape key can cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleCancel]);

  if (!isOpen) return null;

  const handleStart = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = chatTopic.trim();
    if (!trimmed) return;
    onStartChat(trimmed);
  };

  const isSubmitDisabled = !chatTopic.trim();

  return (
    <div
      id="chat-topic-modal-portal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topic-modal-title"
    >
      {/* Backdrop: dark semi-transparent overlay. Clicking does NOT close modal to prevent losing input */}
      <div
        id="topic-modal-backdrop"
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
        aria-hidden="true"
      />

      {/* Container: Centered white rectangular card */}
      <div
        id="topic-modal-card"
        className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-white shadow-2xl p-6 border border-gray-100 transform transition-all duration-200 animate-in fade-in zoom-in-95"
      >
        {/* Header */}
        <div id="topic-modal-header" className="mb-4">
          <h2
            id="topic-modal-title"
            className="text-lg font-bold text-gray-900 leading-snug tracking-tight"
          >
            New AI Co-pilot Chat
          </h2>
          <p
            id="topic-modal-subtitle"
            className="text-sm text-gray-500 mt-1 leading-relaxed"
          >
            Give this conversation a topic so you can easily find it later.
          </p>
        </div>

        {/* Form Form Container */}
        <form id="topic-modal-form" onSubmit={handleStart}>
          {/* Input Field */}
          <div className="space-y-1.5">
            <label htmlFor="topic-input" className="sr-only">
              Chat Topic
            </label>
            <input
              id="topic-input"
              ref={inputRef}
              type="text"
              value={chatTopic}
              onChange={(e) => setChatTopic(e.target.value)}
              placeholder="e.g., আজকের সেলস রিপোর্ট, Low stock items..."
              className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-xs"
            />
          </div>

          {/* Quick Suggestion Chips */}
          <div id="topic-suggestions-section" className="mt-3">
            <span
              id="topic-suggestions-label"
              className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
            >
              Suggestions:
            </span>
            <div
              id="topic-suggestions-chips"
              className="mt-1.5 flex flex-wrap gap-2"
            >
              {SUGGESTIONS.map((suggestion) => (
                <button
                  id={`topic-chip-${suggestion.toLowerCase().replace(/\s+/g, "-")}`}
                  key={suggestion}
                  type="button"
                  onClick={() => setChatTopic(suggestion)}
                  className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:border-gray-300 active:scale-95 transition-all duration-150 cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons (Footer) */}
          <div
            id="topic-modal-footer"
            className="mt-6 flex items-center justify-end gap-2.5 border-t border-gray-100 pt-4"
          >
            <button
              id="topic-cancel-btn"
              type="button"
              onClick={handleCancel}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:scale-95 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="topic-start-btn"
              type="submit"
              disabled={isSubmitDisabled}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 active:scale-95 transition-all disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:active:scale-100 cursor-pointer"
            >
              Start Chat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatTopicModal;
