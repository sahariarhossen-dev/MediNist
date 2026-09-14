import React, { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  MoreVertical,
  Paperclip,
  Send,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AIChatThreadScreenProps {
  topic: string;
  conversationId?: string;
  onBack: () => void;
}

interface Message {
  id: string;
  sender: "ai" | "user";
  text: string;
  timestamp: string;
  image?: string;
  isError?: boolean;
}

export const AIChatThreadScreen: React.FC<AIChatThreadScreenProps> = ({
  topic,
  conversationId,
  onBack,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(Boolean(conversationId));
  const [activeConvId, setActiveConvId] = useState<string | undefined>(conversationId);

  // Sync state if prop changes
  useEffect(() => {
    setActiveConvId(conversationId);
  }, [conversationId]);

  // Load message history from public.ai_messages when conversationId is available
  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      if (!conversationId) {
        setMessages([
          {
            id: "msg-welcome",
            sender: "ai",
            text: `Hello! I am ready to help you with: ${topic}. What would you like to know?`,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
        setIsHistoryLoading(false);
        return;
      }

      setIsHistoryLoading(true);
      try {
        const { data, error } = await supabase
          .from("ai_messages")
          .select("id, role, content, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (error) {
          console.warn("[AIChatThreadScreen] Could not load messages:", error);
        } else if (data && data.length > 0 && isMounted) {
          setMessages(
            data.map((m) => ({
              id: m.id,
              sender: m.role === "assistant" ? "ai" : "user",
              text: m.content,
              timestamp: new Date(m.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            }))
          );
          return;
        }
      } catch (err) {
        console.warn("[AIChatThreadScreen] Exception loading history:", err);
      } finally {
        if (isMounted) setIsHistoryLoading(false);
      }

      // Default welcome message if thread has no previous messages
      if (isMounted) {
        setMessages([
          {
            id: `msg-welcome-${Date.now()}`,
            sender: "ai",
            text: `Hello! I am ready to help you with: ${topic}. What would you like to know?`,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
      }
    };

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [conversationId, topic]);

  const [inputMessage, setInputMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState<{
    file: File;
    previewUrl: string;
    base64: string;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, selectedImage]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size limit (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setFileError("File size exceeds 5MB limit. Please choose a smaller image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFileError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result as string;
      setSelectedImage({
        file,
        previewUrl: base64Data,
        base64: base64Data,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputMessage.trim();
    if ((!trimmed && !selectedImage) || isLoading) return;

    const userText = trimmed || (selectedImage ? "Please process this prescription/medicine image." : "");
    const imageToSend = selectedImage?.base64;
    const userTimestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: userText,
      timestamp: userTimestamp,
      image: imageToSend,
    };

    // Append user message immediately & clear input + selected image
    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setSelectedImage(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsLoading(true);

    // If active conversation exists, persist user message in background
    if (activeConvId) {
      supabase
        .from("ai_messages")
        .insert({
          conversation_id: activeConvId,
          role: "user",
          content: userText,
        })
        .then(({ error }) => {
          if (error) console.warn("[AIChatThreadScreen] Could not persist user message:", error);
        });
    }

    // Build entire conversation history array for AI memory
    const conversationHistory = [
      ...messages
        .filter((m) => !m.isError && m.text.trim().length > 0)
        .map((m) => ({
          role: m.sender === "ai" ? ("assistant" as const) : ("user" as const),
          content: m.text.trim(),
        })),
      {
        role: "user" as const,
        content: userText,
      },
    ];

    try {
      const { data, error } = await supabase.functions.invoke("medinist-ai", {
        body: {
          messages: conversationHistory,
          imageBase64: imageToSend || undefined,
        },
      });

      if (error) throw error;

      const reply =
        data?.reply ||
        (typeof data === "string" ? data : null);

      if (!reply) {
        throw new Error("No response received from AI agent.");
      }

      const aiMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        sender: "ai",
        text: reply,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Persist assistant message and touch updated_at
      if (activeConvId) {
        supabase
          .from("ai_messages")
          .insert({
            conversation_id: activeConvId,
            role: "assistant",
            content: reply,
          })
          .then(async ({ error: insertErr }) => {
            if (insertErr) console.warn("[AIChatThreadScreen] Could not persist AI reply:", insertErr);
            await supabase
              .from("ai_conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", activeConvId);
          });
      }
    } catch (error) {
      console.warn(
        "[AIChatThreadScreen] Could not reach edge function, displaying error status:",
        error
      );
      // Append red/error-styled AI message bubble
      const errorMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        sender: "ai",
        text: "Sorry, I couldn't connect to the server. Please check your connection or try again.",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="ai-chat-thread-screen"
      className="fixed inset-0 z-50 flex justify-center bg-gray-100"
    >
      {/* Mobile-first full-height centered layout */}
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl overflow-hidden">
        {/* 2. Top App Bar (Header) */}
        <header
          id="chat-thread-header"
          className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2.5 shadow-xs"
        >
          {/* Left: Back Arrow Button */}
          <button
            id="chat-thread-back-btn"
            type="button"
            onClick={onBack}
            aria-label="Back to chat list"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 active:scale-95 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Center Flex: Avatar + Title + Subtitle */}
          <div className="flex flex-1 items-center gap-2.5 min-w-0 px-2">
            <div
              id="chat-thread-header-avatar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-sm shadow-xs select-none"
            >
              M
            </div>
            <div className="min-w-0 flex-1">
              <h1
                id="chat-thread-title"
                className="truncate text-[15px] font-bold text-gray-900 leading-snug"
              >
                {topic}
              </h1>
              <p
                id="chat-thread-subtitle"
                className="text-xs font-semibold text-emerald-600 leading-none mt-0.5"
              >
                MediNist AI Co-pilot
              </p>
            </div>
          </div>

          {/* Right: Three Dots (More Options) */}
          <button
            id="chat-thread-more-btn"
            type="button"
            aria-label="More options"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-95 transition-colors cursor-pointer"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </header>

        {/* 3. Chat Message Area (Scrollable Body) */}
        <main
          id="chat-thread-messages-list"
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50/60"
        >
          {isHistoryLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600 mb-2" />
              <p className="text-xs font-medium text-gray-500">Loading conversation history...</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isAI = msg.sender === "ai";
              return (
                <div
                  key={msg.id}
                  id={`thread-message-${msg.id}`}
                  className={`flex w-full ${isAI ? "justify-start" : "justify-end"}`}
                >
                {isAI ? (
                  /* AI Message Layout */
                  <div className="flex items-end gap-2 max-w-[85%]">
                    {/* Small 'M' Avatar next to AI bubble */}
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white font-black text-[11px] shadow-2xs select-none mb-4 ${
                        msg.isError ? "bg-red-500" : "bg-blue-600"
                      }`}
                    >
                      M
                    </div>
                    <div>
                      {msg.isError ? (
                        /* Red/Error Styled AI Message Bubble */
                        <div className="rounded-2xl rounded-bl-xs border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-[14px] leading-relaxed text-red-700 shadow-xs flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                          <span>{msg.text}</span>
                        </div>
                      ) : (
                        /* Standard AI Message Bubble */
                        <div className="rounded-2xl rounded-bl-xs border border-gray-200/80 bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-gray-800 shadow-xs">
                          {msg.text}
                        </div>
                      )}
                      <span
                        className={`block pl-1 pt-1 text-[11px] font-medium ${
                          msg.isError ? "text-red-400" : "text-gray-400"
                        }`}
                      >
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* User Message Layout */
                  <div className="max-w-[85%]">
                    <div className="rounded-2xl rounded-br-xs bg-blue-600 px-3.5 py-2.5 text-[14px] leading-relaxed text-white shadow-xs">
                      {msg.image && (
                        <div className="mb-2 overflow-hidden rounded-lg border border-white/20 bg-black/15 p-1">
                          <img
                            src={msg.image}
                            alt="Uploaded prescription or medicine"
                            className="max-h-52 w-auto max-w-full rounded-md object-contain"
                          />
                        </div>
                      )}
                      {msg.text}
                    </div>
                    <span className="block pr-1 pt-1 text-right text-[11px] font-medium text-gray-400">
                      {msg.timestamp}
                    </span>
                  </div>
                )}
              </div>
            );
          }))}

          {/* Temporary Thinking indicator while isLoading */}
          {isLoading && (
            <div
              id="thread-thinking-indicator"
              className="flex w-full justify-start items-end gap-2 animate-in fade-in duration-200"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-black text-[11px] shadow-2xs select-none mb-1">
                M
              </div>
              <div className="rounded-2xl rounded-bl-xs border border-gray-200/80 bg-white px-3.5 py-2.5 shadow-xs flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                <span className="text-[13px] font-medium text-gray-600">Thinking...</span>
                <span className="flex space-x-1 ml-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600/60 animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600/60 animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600/60 animate-bounce"></span>
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* 4. Sticky Input Area (Footer) */}
        <footer
          id="chat-thread-footer"
          className="border-t border-gray-200 bg-white px-3 py-2.5 shadow-sm"
        >
          {/* Selected Image Thumbnail Preview with Remove (X) */}
          {selectedImage && (
            <div className="mb-2.5 flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/60 p-1.5 pr-2 shadow-2xs animate-in fade-in zoom-in-95 duration-150">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-blue-200/70 bg-white shadow-2xs">
                <img
                  src={selectedImage.previewUrl}
                  alt="Prescription preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-gray-800">
                  {selectedImage.file.name}
                </p>
                <p className="text-[10px] text-blue-600 font-medium">
                  {(selectedImage.file.size / 1024).toFixed(1)} KB • Ready for Vision OCR
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={isLoading}
                aria-label="Remove attached image"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* File size error notice if user uploaded > 5MB */}
          {fileError && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            disabled={isLoading}
            onChange={handleFileSelect}
            className="hidden"
          />

          <form
            id="chat-thread-input-form"
            onSubmit={handleSendMessage}
            className="flex items-center rounded-full bg-gray-100 px-3 py-1.5 border border-gray-200/70 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/10 transition-all"
          >
            {/* Left: Attachment/Paperclip Icon Button */}
            <button
              id="chat-thread-attach-btn"
              type="button"
              disabled={isLoading}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach prescription or medicine image for OCR"
              className="p-1.5 text-gray-500 hover:text-blue-600 active:scale-95 transition-all rounded-full disabled:opacity-40 cursor-pointer"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Middle: Borderless Text Input */}
            <input
              id="chat-thread-input"
              type="text"
              value={inputMessage}
              disabled={isLoading}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                isLoading
                  ? "MediNist AI is thinking..."
                  : selectedImage
                  ? "Add note or send prescription image..."
                  : "Message MediNist AI or attach prescription..."
              }
              className="flex-1 bg-transparent px-2 text-[13.5px] text-gray-900 placeholder:text-gray-400 outline-none disabled:opacity-60"
            />

            {/* Right: Solid Circular Send Button */}
            <button
              id="chat-thread-send-btn"
              type="submit"
              disabled={(!inputMessage.trim() && !selectedImage) || isLoading}
              aria-label="Send message"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs hover:bg-emerald-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-emerald-500 disabled:active:scale-100 transition-all cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 translate-x-px" />
              )}
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
};

export default AIChatThreadScreen;
