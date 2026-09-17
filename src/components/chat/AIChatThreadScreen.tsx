import React, { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  MoreVertical,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AIChatInputBar } from "./AIChatInputBar";
import { WhatsAppVoiceNote } from "./WhatsAppVoiceNote";

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
  isAudio?: boolean;
  isTranscribing?: boolean;
  audioUrl?: string;
}

const isValidUuid = (val?: string | null): boolean => {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};

export const AIChatThreadScreen: React.FC<AIChatThreadScreenProps> = ({
  topic,
  conversationId,
  onBack,
}) => {
  const { profile, user } = useAuth();
  const currentUserAvatar = profile?.avatar_url || undefined;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(Boolean(conversationId && isValidUuid(conversationId)));
  const [activeConvId, setActiveConvId] = useState<string | undefined>(
    conversationId && isValidUuid(conversationId) ? conversationId : undefined
  );

  // Sync state if prop changes
  useEffect(() => {
    setActiveConvId(conversationId && isValidUuid(conversationId) ? conversationId : undefined);
  }, [conversationId]);

  // Load message history from public.ai_messages when conversationId is available
  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      if (!conversationId || !isValidUuid(conversationId)) {
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
          .select("id, role, content, created_at, audio_url")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (error) {
          console.warn("[AIChatThreadScreen] Could not load messages:", error);
        } else if (data && data.length > 0 && isMounted) {
          setMessages(
            data.map((m: any) => ({
              id: m.id,
              sender: m.role === "assistant" ? "ai" : "user",
              text: m.content || "",
              isAudio: Boolean(m.audio_url || (m.content && m.content.startsWith("🎤"))),
              audioUrl: m.audio_url || undefined,
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

  const [selectedImage, setSelectedImage] = useState<{
    file: File;
    previewUrl: string;
    base64: string;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, selectedImage]);

  const handleFileSelect = (file: File) => {
    // Check file size limit (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setFileError("File size exceeds 5MB limit. Please choose a smaller image.");
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
  };

  const handleSendMessage = async (
    customText?: string,
    customImageBase64?: string,
    audioBase64?: string,
    audioBlob?: Blob
  ) => {
    const trimmed = (customText !== undefined ? customText : "").trim();
    const imageToSend = customImageBase64 !== undefined ? customImageBase64 : selectedImage?.base64;
    const isAudio = Boolean(audioBase64 || audioBlob);

    if ((!trimmed && !imageToSend && !isAudio) || isLoading) return;

    const userTimestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: isAudio
        ? ""
        : (trimmed || (imageToSend ? "Please process this prescription/medicine image." : "")),
      timestamp: userTimestamp,
      image: imageToSend,
      isAudio: isAudio,
      isTranscribing: isAudio,
      audioUrl: audioBase64 || undefined,
    };

    // Append user message immediately & clear selected image
    setMessages((prev) => [...prev, userMsg]);
    setSelectedImage(null);
    setFileError(null);
    setIsLoading(true);

    const pharmacyId = profile?.pharmacy_id || null;
    const currentUserId = user?.id || null;
    let currentConvId = activeConvId;

    // Ensure conversation exists in public.ai_conversations
    if ((!currentConvId || !isValidUuid(currentConvId)) && (pharmacyId || currentUserId)) {
      try {
        const { data: newConv } = await supabase
          .from("ai_conversations")
          .insert({
            title: topic || (isAudio ? "Voice Consultation" : trimmed.slice(0, 40) || "New chat"),
            pharmacy_id: pharmacyId || undefined as any,
            user_id: currentUserId || undefined as any,
            topic_key: (topic || "general").trim().toLowerCase().replace(/\s+/g, "_"),
          })
          .select("id")
          .single();

        if (newConv?.id) {
          currentConvId = newConv.id;
          setActiveConvId(newConv.id);
        }
      } catch (convErr) {
        console.warn("[AIChatThreadScreen] Could not auto-create conversation:", convErr);
      }
    }

    // Persist standard text/image user message immediately
    if (currentConvId && isValidUuid(currentConvId) && !isAudio) {
      supabase
        .from("ai_messages")
        .insert({
          conversation_id: currentConvId,
          role: "user",
          content: userMsg.text,
          pharmacy_id: pharmacyId,
          user_id: currentUserId,
        })
        .then(({ error }) => {
          if (error) console.warn("[AIChatThreadScreen] Could not persist user message:", error);
        });
    }

    // Audio Persistence Pipeline: Upload audio Blob to Supabase Storage 'chat-audio' & get immutable public URL
    let persistentAudioUrl = audioBase64 || "";
    if (isAudio) {
      try {
        let blobToUpload: Blob | null = audioBlob || null;
        if (!blobToUpload && audioBase64) {
          try {
            const res = await fetch(audioBase64);
            blobToUpload = await res.blob();
          } catch (fetchErr) {
            console.warn("[AIChatThreadScreen] Could not convert audio dataURL to blob:", fetchErr);
          }
        }

        if (blobToUpload) {
          const tenantPharmacyId = pharmacyId || "general";
          const tenantUserId = currentUserId || "anonymous";
          const uniqueId =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const filePath = `${tenantPharmacyId}/${tenantUserId}/${uniqueId}.webm`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("chat-audio")
            .upload(filePath, blobToUpload, {
              contentType: blobToUpload.type || "audio/webm",
              upsert: true,
            });

          if (uploadError) {
            console.warn("[AIChatThreadScreen] Storage upload failed, using fallback:", uploadError);
          } else if (uploadData) {
            const { data: publicUrlData } = supabase.storage
              .from("chat-audio")
              .getPublicUrl(filePath);

            if (publicUrlData?.publicUrl) {
              persistentAudioUrl = publicUrlData.publicUrl;
              // Update the in-memory message so it references the permanent public URL
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === userMsg.id ? { ...m, audioUrl: persistentAudioUrl } : m
                )
              );
            }
          }
        }

        // Insert audio message into database with public URL and tenant IDs
        if (currentConvId) {
          const { error: insertAudioErr } = await supabase
            .from("ai_messages")
            .insert({
              conversation_id: currentConvId,
              role: "user",
              content: "Voice message",
              audio_url: persistentAudioUrl,
              pharmacy_id: pharmacyId,
              user_id: currentUserId,
            });

          if (insertAudioErr) {
            console.warn("[AIChatThreadScreen] Could not persist audio message to DB:", insertAudioErr);
          }
        }
      } catch (audioPipelineErr) {
        console.warn("[AIChatThreadScreen] Audio persistence pipeline exception:", audioPipelineErr);
      }
    }

    // Build entire conversation history array for AI memory
    const conversationHistory = [
      ...messages
        .filter((m) => !m.isError && m.text.trim().length > 0 && !m.isTranscribing)
        .map((m) => ({
          role: m.sender === "ai" ? ("assistant" as const) : ("user" as const),
          content: m.text.trim(),
        })),
      ...(trimmed ? [{ role: "user" as const, content: trimmed }] : []),
    ];

    try {
      const { data, error } = await supabase.functions.invoke("medinist-ai", {
        body: {
          messages: conversationHistory,
          imageBase64: imageToSend || undefined,
          audioBase64: audioBase64 || undefined,
        },
      });

      if (error) throw error;

      // Pure background transcription: save internally for context and persistence
      const transcribed = data?.transcribedText;
      if (isAudio) {
        const internalText = transcribed || "Voice message";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id
              ? {
                  ...m,
                  text: internalText,
                  isAudio: true,
                  isTranscribing: false,
                }
              : m
          )
        );

        if (currentConvId && transcribed && persistentAudioUrl) {
          supabase
            .from("ai_messages")
            .update({
              content: `🎤 ${transcribed}`,
            })
            .eq("conversation_id", currentConvId)
            .eq("audio_url", persistentAudioUrl)
            .then(({ error: updateErr }) => {
              if (updateErr) {
                console.warn("[AIChatThreadScreen] Could not update audio transcript in DB:", updateErr);
              }
            });
        }
      }

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
      if (currentConvId && isValidUuid(currentConvId)) {
        supabase
          .from("ai_messages")
          .insert({
            conversation_id: currentConvId,
            role: "assistant",
            content: reply,
            pharmacy_id: pharmacyId,
            user_id: currentUserId,
          })
          .then(async ({ error: insertErr }) => {
            if (insertErr) console.warn("[AIChatThreadScreen] Could not persist AI reply:", insertErr);
            await supabase
              .from("ai_conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", currentConvId);
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
                    {msg.audioUrl ? (
                      /* Render ONLY the WhatsAppVoiceNote player component - pure voice-in conversational experience */
                      <WhatsAppVoiceNote
                        audioUrl={msg.audioUrl}
                        timestamp={msg.timestamp}
                        avatarUrl={currentUserAvatar}
                        isSender={true}
                      />
                    ) : (
                      <>
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
                          <div>{msg.text}</div>
                        </div>
                        <span className="block pr-1 pt-1 text-right text-[11px] font-medium text-gray-400">
                          {msg.timestamp}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          }))}

          {/* WhatsApp-Style Thinking indicator while isLoading */}
          {isLoading && (
            <div
              id="thread-thinking-indicator"
              className="flex w-full justify-start items-end gap-2.5 animate-in fade-in duration-200"
            >
              {/* MediNist AI avatar on the left */}
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-black text-[11px] shadow-2xs select-none mb-0.5"
                title="MediNist AI"
              >
                M
              </div>

              {/* Bubble background (white / slate-800 with rounded-2xl) */}
              <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-xs border border-gray-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 px-3.5 py-2.5 shadow-xs">
                {/* 3 bouncing animated dots with staggered animation-delay: 0ms, 150ms, 300ms */}
                <div className="flex items-center gap-1.5 py-0.5">
                  <span
                    className="h-2 w-2 rounded-full bg-blue-600 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-blue-600 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-blue-600 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
                {/* Subtle muted text: "Thinking..." */}
                <span className="text-[13px] font-medium text-gray-500 dark:text-gray-400 select-none">
                  Thinking...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* 4. WhatsApp Web/Mobile Style Bottom Chat Input Bar */}
        <AIChatInputBar
          onSendMessage={(text, img, audio, audioBlob) =>
            handleSendMessage(text, img, audio, audioBlob)
          }
          isLoading={isLoading}
          selectedImage={selectedImage}
          onSelectImage={handleFileSelect}
          onRemoveImage={handleRemoveImage}
          fileError={fileError}
        />
      </div>
    </div>
  );
};

export default AIChatThreadScreen;
