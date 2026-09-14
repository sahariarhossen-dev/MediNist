import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  X,
  MessageSquarePlus,
  Sparkles,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  TrendingUp,
  PackageCheck,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { NewChatModal } from "./NewChatModal";
import { ChatTopicModal } from "./ChatTopicModal";
import { AIChatThreadScreen } from "./AIChatThreadScreen";

export type FilterTabId = "all" | "ai" | "unread" | "shop";

export interface FilterTab {
  id: FilterTabId;
  label: string;
  badge?: number;
}

export interface ConversationItem {
  id: string;
  title: string;
  topic_key: string | null;
  pharmacy_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  subtitle: string;
  lastMessageRole?: string;
  timestamp: string;
  unreadCount?: number;
}

function formatChatTimestamp(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "Just now";

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export const ChatListScreen: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTabId>("all");
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [chatTopic, setChatTopic] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Active conversation navigation state
  const [selectedConversation, setSelectedConversation] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Active pharmacy ID from profile (with fallback to user id lookup if needed)
  const pharmacyId = profile?.pharmacy_id;

  const fetchConversations = useCallback(
    async (showLoadingSpinner = true) => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      if (showLoadingSpinner) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      try {
        // Resolve active pharmacy ID
        let activePharmacyId = pharmacyId;

        if (!activePharmacyId) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("pharmacy_id")
            .eq("id", user.id)
            .single();

          if (profileData?.pharmacy_id) {
            activePharmacyId = profileData.pharmacy_id;
          }
        }

        if (!activePharmacyId) {
          setConversations([]);
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }

        // Query public.ai_conversations filtered by pharmacy_id and archived_at IS NULL
        // Ordered by updated_at in descending order
        const { data, error: queryError } = await supabase
          .from("ai_conversations")
          .select(`
            id,
            title,
            topic_key,
            pharmacy_id,
            user_id,
            created_at,
            updated_at,
            archived_at,
            ai_messages (
              id,
              content,
              created_at,
              role
            )
          `)
          .eq("pharmacy_id", activePharmacyId)
          .is("archived_at", null)
          .order("updated_at", { ascending: false });

        if (queryError) {
          console.error("[ChatListScreen] Query error:", queryError);
          setError("Failed to load conversations. Please tap refresh to retry.");
          return;
        }

        if (data) {
          const mapped: ConversationItem[] = data.map((conv) => {
            // Sort nested messages to get the most recent one for the preview
            const sortedMsgs = (conv.ai_messages || []).sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );

            const lastMsg = sortedMsgs[0];
            let subtitle = "Tap to start chatting with AI";
            if (lastMsg?.content) {
              const prefix = lastMsg.role === "user" ? "You: " : "";
              subtitle = `${prefix}${lastMsg.content.trim()}`;
            }

            const latestTimestamp = lastMsg?.created_at || conv.updated_at || conv.created_at;

            return {
              id: conv.id,
              title: conv.title || "Untitled Conversation",
              topic_key: conv.topic_key,
              pharmacy_id: conv.pharmacy_id,
              user_id: conv.user_id,
              created_at: conv.created_at,
              updated_at: conv.updated_at,
              archived_at: conv.archived_at,
              subtitle,
              lastMessageRole: lastMsg?.role,
              timestamp: formatChatTimestamp(latestTimestamp),
            };
          });

          setConversations(mapped);
        }
      } catch (err) {
        console.error("[ChatListScreen] Unexpected error fetching conversations:", err);
        setError("Network connection issue. Please check your connection.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [user, pharmacyId]
  );

  // Initial fetch and dependency on user or profile
  useEffect(() => {
    if (!authLoading) {
      fetchConversations(true);
    }
  }, [authLoading, fetchConversations]);

  // Real-time synchronization for ai_conversations table
  useEffect(() => {
    if (!pharmacyId) return;

    const channel = supabase
      .channel(`ai_conversations_realtime_${pharmacyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_conversations",
          filter: `pharmacy_id=eq.${pharmacyId}`,
        },
        () => {
          // Re-fetch conversation list silently on changes
          fetchConversations(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pharmacyId, fetchConversations]);

  // Start new conversation handler
  const handleStartChat = async (topic: string) => {
    setIsTopicModalOpen(false);
    setChatTopic("");

    const activePharmacyId = pharmacyId;
    const currentUserId = user?.id;

    if (!activePharmacyId || !currentUserId) {
      // Fallback navigation
      setSelectedConversation({ id: "", title: topic });
      return;
    }

    try {
      setIsCreating(true);
      const { data, error: insertError } = await supabase
        .from("ai_conversations")
        .insert({
          title: topic.trim() || "New chat",
          pharmacy_id: activePharmacyId,
          user_id: currentUserId,
          topic_key: topic.trim().toLowerCase().replace(/\s+/g, "_"),
        })
        .select()
        .single();

      if (insertError) {
        console.warn("[ChatListScreen] Insert conversation failed:", insertError);
        setSelectedConversation({ id: "", title: topic });
      } else if (data) {
        setSelectedConversation({ id: data.id, title: data.title });
        // Background refresh
        fetchConversations(false);
      }
    } catch (err) {
      console.error("[ChatListScreen] Error starting new chat:", err);
      setSelectedConversation({ id: "", title: topic });
    } finally {
      setIsCreating(false);
    }
  };

  // Filter tabs definition with dynamic counters
  const filterTabs: FilterTab[] = useMemo(() => {
    return [
      { id: "all", label: "All", badge: conversations.length > 0 ? conversations.length : undefined },
      { id: "ai", label: "MediNist AI" },
      { id: "unread", label: "Unread" },
      { id: "shop", label: "Shop Messages" },
    ];
  }, [conversations.length]);

  // Filtered chats based on tab and search
  const filteredChats = useMemo(() => {
    return conversations.filter((item) => {
      // Tab filter
      if (activeTab === "unread") {
        if ((item.unreadCount ?? 0) === 0) return false;
      }
      if (activeTab === "shop") {
        // Shop tab has no AI conversations
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesSubtitle = item.subtitle.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubtitle) return false;
      }

      return true;
    });
  }, [conversations, activeTab, searchQuery]);

  // When a thread is selected, render the full AIChatThreadScreen
  if (selectedConversation) {
    return (
      <AIChatThreadScreen
        topic={selectedConversation.title}
        conversationId={selectedConversation.id || undefined}
        onBack={() => {
          setSelectedConversation(null);
          fetchConversations(false);
        }}
      />
    );
  }

  return (
    <div id="chat-list-screen" className="min-h-screen bg-gray-50/60 pb-28 text-gray-900 font-sans">
      {/* Mobile-first centered frame */}
      <div className="mx-auto max-w-md w-full">
        {/* Sticky Header Section */}
        <div
          id="chat-list-header"
          className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-gray-200/80 px-4 pt-3.5 pb-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
        >
          {/* Header Title & Sync Status Bar */}
          <div className="flex items-center justify-between mb-2 px-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                Messages
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/60">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                Live Cloud Sync
              </span>
            </div>
            <button
              id="chat-refresh-btn"
              type="button"
              onClick={() => fetchConversations(false)}
              disabled={isRefreshing || isLoading}
              aria-label="Refresh conversations"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin text-blue-600" : ""}`}
              />
            </button>
          </div>

          {/* Search Bar */}
          <div id="chat-search-bar" className="relative w-full">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              id="chat-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations, stock, or dues..."
              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-100/90 pl-10 pr-10 text-[13.5px] text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
            />
            {searchQuery && (
              <button
                id="chat-search-clear-btn"
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs (Pill Navigation) */}
          <div
            id="chat-filter-tabs"
            className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth pb-0.5"
          >
            {filterTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  id={`chat-tab-${tab.id}`}
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-all duration-150 select-none cursor-pointer ${
                    isActive
                      ? "border border-emerald-500 bg-emerald-50/70 text-emerald-600 font-semibold ring-1 ring-emerald-500/20"
                      : "border border-gray-200 bg-white text-gray-600 hover:text-gray-900 font-medium hover:border-gray-300"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      id={`chat-tab-badge-${tab.id}`}
                      className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        isActive
                          ? "bg-emerald-600 text-white"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error Alert Bar */}
        {error && (
          <div
            id="chat-error-banner"
            className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs text-red-700 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchConversations(true)}
              className="ml-2 rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-700 active:scale-95 transition-all cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Chat List Container */}
        <div className="px-4 pt-3.5">
          <div
            id="chat-list-card"
            className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xs divide-y divide-gray-100"
          >
            {/* Loading State: Clean pulsing skeleton cards */}
            {isLoading ? (
              <div id="chat-list-loading" className="divide-y divide-gray-100">
                {[1, 2, 3, 4].map((index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="flex items-center gap-3.5 px-4 py-3.5 animate-pulse"
                  >
                    <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-4 w-32 rounded-md bg-gray-200" />
                        <div className="h-3 w-12 rounded-md bg-gray-100" />
                      </div>
                      <div className="h-3.5 w-48 rounded-md bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredChats.length > 0 ? (
              /* Real Database Records List */
              filteredChats.map((chat) => (
                <div
                  id={`chat-item-${chat.id}`}
                  key={chat.id}
                  onClick={() =>
                    setSelectedConversation({
                      id: chat.id,
                      title: chat.title,
                    })
                  }
                  className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-gray-50/80 cursor-pointer group"
                >
                  {/* MediNist AI Avatar */}
                  <div
                    id={`chat-avatar-${chat.id}`}
                    className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-200/80 shadow-xs group-hover:border-blue-400 group-hover:bg-blue-100/60 transition-colors"
                  >
                    <span className="text-lg font-black tracking-tight text-blue-600 select-none">
                      M
                    </span>
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                  </div>

                  {/* Text Content (Title & Subtitle Preview) */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h3
                        id={`chat-title-${chat.id}`}
                        className="text-[14.5px] font-bold text-gray-900 leading-snug truncate"
                      >
                        {chat.title}
                      </h3>
                      <span
                        id={`chat-time-${chat.id}`}
                        className="text-[11.5px] font-medium text-gray-400 shrink-0 whitespace-nowrap"
                      >
                        {chat.timestamp}
                      </span>
                    </div>
                    <p
                      id={`chat-subtitle-${chat.id}`}
                      className="text-[13px] font-normal text-gray-500 truncate mt-0.5 leading-relaxed"
                    >
                      {chat.subtitle}
                    </p>
                  </div>
                </div>
              ))
            ) : activeTab === "shop" ? (
              /* Dedicated Shop/Staff Empty State */
              <div id="chat-list-shop-empty" className="py-12 px-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 mb-3">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  No shop messages yet
                </h3>
                <p className="mt-1 text-xs text-gray-500 max-w-xs mx-auto">
                  Staff communication and group channels will appear here once active.
                </p>
              </div>
            ) : searchQuery.trim() ? (
              /* Search Empty State */
              <div id="chat-list-search-empty" className="py-12 px-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 mb-3">
                  <Search className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  No matching conversations
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  No chats found matching &ldquo;{searchQuery}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-3 inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  Clear search
                </button>
              </div>
            ) : (
              /* Clean DB Empty State */
              <div id="chat-list-empty" className="py-10 px-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 mb-3.5 shadow-xs">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-gray-900">
                  No conversations yet
                </h3>
                <p className="mt-1.5 text-[13px] text-gray-500 max-w-xs mx-auto leading-relaxed">
                  Start your first conversation with MediNist AI to check stock, calculate daily sales, or manage customer dues.
                </p>

                {/* Primary CTA to start chat */}
                <div className="mt-5">
                  <button
                    id="chat-empty-start-btn"
                    type="button"
                    onClick={() => setIsTopicModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 active:scale-95 transition-all cursor-pointer"
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                    Start New AI Chat
                  </button>
                </div>

                {/* Quick Prompts Suggestions */}
                <div className="mt-6 border-t border-gray-100 pt-5 text-left">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2.5 text-center">
                    Quick Suggestions
                  </span>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => handleStartChat("আজকের সেলস রিপোর্ট")}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-gray-50/70 px-3.5 py-2.5 text-left text-xs font-medium text-gray-700 hover:bg-blue-50/70 hover:border-blue-200 hover:text-blue-700 transition-colors cursor-pointer"
                    >
                      <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="truncate">আজকের বিক্রি ও সেলস সামারি</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartChat("Low stock medicines check")}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-gray-50/70 px-3.5 py-2.5 text-left text-xs font-medium text-gray-700 hover:bg-blue-50/70 hover:border-blue-200 hover:text-blue-700 transition-colors cursor-pointer"
                    >
                      <PackageCheck className="h-4 w-4 text-blue-600 shrink-0" />
                      <span className="truncate">Check low stock medicines</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartChat("Customer dues balance")}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-gray-50/70 px-3.5 py-2.5 text-left text-xs font-medium text-gray-700 hover:bg-blue-50/70 hover:border-blue-200 hover:text-blue-700 transition-colors cursor-pointer"
                    >
                      <CreditCard className="h-4 w-4 text-amber-600 shrink-0" />
                      <span className="truncate">কাস্টমার বাকি ও ডিউ হিস্টোরি</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating Action Button (FAB) */}
        <button
          id="chat-fab-new"
          type="button"
          aria-label="New chat"
          onClick={() => setIsNewChatOpen(true)}
          className="fixed bottom-24 right-5 sm:right-8 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 active:scale-95 transition-all duration-150 cursor-pointer"
        >
          <MessageSquarePlus className="h-6 w-6" />
        </button>

        {/* New Chat Bottom Sheet / Modal */}
        <NewChatModal
          isOpen={isNewChatOpen}
          onClose={() => setIsNewChatOpen(false)}
          onSelectAI={() => {
            setIsNewChatOpen(false);
            setIsTopicModalOpen(true);
          }}
        />

        {/* Chat Topic Centered Modal */}
        <ChatTopicModal
          isOpen={isTopicModalOpen}
          onClose={() => setIsTopicModalOpen(false)}
          chatTopic={chatTopic}
          setChatTopic={setChatTopic}
          onStartChat={handleStartChat}
        />
      </div>
    </div>
  );
};

export default ChatListScreen;
