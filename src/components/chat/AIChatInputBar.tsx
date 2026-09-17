import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Paperclip,
  Camera,
  Mic,
  Send,
  Trash2,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";

export interface AIChatInputBarProps {
  onSendMessage: (
    text?: string,
    imageBase64?: string,
    audioBase64?: string,
    audioBlob?: Blob
  ) => Promise<void> | void;
  isLoading: boolean;
  selectedImage: {
    file: File;
    previewUrl: string;
    base64: string;
  } | null;
  onSelectImage: (file: File) => void;
  onRemoveImage: () => void;
  fileError: string | null;
}

export const AIChatInputBar: React.FC<AIChatInputBarProps> = ({
  onSendMessage,
  isLoading,
  selectedImage,
  onSelectImage,
  onRemoveImage,
  fileError,
}) => {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const holdStartTimeRef = useRef<number>(0);
  const isHoldingRef = useRef<boolean>(false);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 120); // Cap at 120px (~5 lines)
    el.style.height = `${Math.max(24, newHeight)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText, adjustTextareaHeight]);

  // Clean up timer and media stream on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Format seconds into m:ss (e.g. 0:05, 1:12)
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Start voice recording via getUserMedia & MediaRecorder
  const startRecording = async () => {
    if (isLoading || isRecording) return;
    setMicError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicError("Microphone recording is not supported in this browser.");
      isHoldingRef.current = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      let mimeType = "";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/aac")) {
          mimeType = "audio/aac";
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;

      setIsRecording(true);
      setRecordSeconds(0);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn("[AIChatInputBar] Microphone access notice:", err);
      isHoldingRef.current = false;
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setMicError("Microphone permission denied. Please allow microphone access to record voice messages.");
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        setMicError("No microphone found on this device.");
      } else {
        setMicError("Could not access microphone.");
      }
    }
  };

  // Cancel recording and discard audio
  const cancelRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordSeconds(0);
    isHoldingRef.current = false;
  };

  // Finish recording, convert audio blob to base64, and dispatch onSendMessage
  const finishAndSendRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const activeRecorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current;

    setIsRecording(false);
    setRecordSeconds(0);
    isHoldingRef.current = false;

    if (activeRecorder && activeRecorder.state !== "inactive") {
      activeRecorder.onstop = () => {
        try {
          stream?.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;

          const mimeType = activeRecorder.mimeType || "audio/webm";
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          audioChunksRef.current = [];

          if (audioBlob.size > 0) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Data = reader.result as string;
              onSendMessage(undefined, selectedImage?.base64, base64Data, audioBlob);
            };
            reader.readAsDataURL(audioBlob);
          } else {
            console.warn("[AIChatInputBar] Audio recording was empty.");
          }
        } catch (e) {
          console.warn("[AIChatInputBar] Could not convert audio blob to base64:", e);
        }
      };

      try {
        activeRecorder.stop();
      } catch {
        stream?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
      }
    } else {
      stream?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
    }
  };

  // Handle Send button click for typed text
  const handleSend = () => {
    const text = inputText.trim();
    if (!text && !selectedImage) return;
    onSendMessage(text, selectedImage?.base64);
    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px";
    }
  };

  // Handle key down in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle file select (prescription / invoice)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectImage(file);
    }
    e.target.value = "";
  };

  // Press-and-hold pointer handlers for WhatsApp-style Mic button
  const handleMicPointerDown = (e: React.PointerEvent) => {
    if (isLoading) return;
    e.preventDefault();
    holdStartTimeRef.current = Date.now();
    isHoldingRef.current = true;
    startRecording();
  };

  const handleMicPointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!isHoldingRef.current) return;
    const elapsed = Date.now() - holdStartTimeRef.current;
    if (elapsed < 350) {
      // Quick tap: keep recording active in hands-free mode
      isHoldingRef.current = false;
      return;
    }
    // Held for >= 350ms: release to send immediately!
    finishAndSendRecording();
  };

  const hasContentToText = inputText.trim().length > 0 || Boolean(selectedImage);

  return (
    <footer
      id="chat-thread-footer"
      className="border-t border-slate-200/80 bg-slate-50/90 backdrop-blur-xs px-2.5 sm:px-3 py-2.5 transition-all select-none"
    >
      {/* Selected Image Thumbnail Preview with Remove (X) */}
      {selectedImage && (
        <div
          id="chat-input-image-preview"
          className="mb-2 flex items-center gap-2.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-1.5 pr-2.5 shadow-2xs animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-2xs">
            <img
              src={selectedImage.previewUrl}
              alt="Prescription or invoice preview"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-slate-800">
              {selectedImage.file.name}
            </p>
            <p className="text-[11px] text-emerald-700 font-medium">
              {(selectedImage.file.size / 1024).toFixed(1)} KB • Prescription / Invoice
            </p>
          </div>
          <button
            id="chat-input-remove-image-btn"
            type="button"
            onClick={onRemoveImage}
            disabled={isLoading}
            aria-label="Remove attached image"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* File size or validation error */}
      {fileError && (
        <div
          id="chat-input-file-error"
          className="mb-2 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50/90 px-3 py-1.5 text-[12px] text-red-600 animate-in fade-in duration-150"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-medium">{fileError}</span>
        </div>
      )}

      {/* Microphone permission or device error */}
      {micError && (
        <div
          id="chat-input-mic-error"
          className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/95 px-3 py-1.5 text-[12px] text-red-700 animate-in fade-in duration-150"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span className="font-medium">{micError}</span>
          </div>
          <button
            type="button"
            onClick={() => setMicError(null)}
            className="text-red-400 hover:text-red-700 p-0.5 rounded cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        disabled={isLoading}
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        disabled={isLoading}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Input Row */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* VOICE RECORDING ACTIVE STATE (WhatsApp Style) */}
        {isRecording ? (
          <div
            id="chat-recording-container"
            className="flex flex-1 items-center justify-between rounded-full bg-white border border-red-200/90 px-3.5 py-1.5 shadow-2xs animate-in fade-in zoom-in-98 duration-150"
          >
            {/* Left: Pulsing Red Indicator + Timer + Waves */}
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-85"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>

              <span
                id="chat-recording-timer"
                className="text-[13.5px] font-semibold text-slate-800 tracking-wider tabular-nums select-none"
              >
                {formatTimer(recordSeconds)}
              </span>

              {/* Animated Audio Equalizer Waveforms */}
              <div className="flex items-center gap-0.5 ml-1 select-none">
                {[0.4, 0.9, 0.5, 1, 0.7, 0.3, 0.8, 0.6].map((scale, i) => (
                  <span
                    key={i}
                    className="w-0.5 rounded-full bg-red-500 animate-pulse"
                    style={{
                      height: `${Math.max(6, scale * 18)}px`,
                      animationDuration: `${0.6 + (i % 3) * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Middle: Cancel Action (Trash Icon + Cancel label) */}
            <div className="flex items-center gap-1">
              <button
                id="chat-recording-cancel-btn"
                type="button"
                onClick={cancelRecording}
                aria-label="Cancel voice recording"
                className="group flex items-center gap-1.5 rounded-full px-2.5 py-1 text-slate-500 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all cursor-pointer"
              >
                <Trash2 className="h-4 w-4 transition-transform group-hover:scale-110" />
                <span className="text-[12px] font-medium text-slate-600 group-hover:text-red-600">
                  Cancel
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* STANDARD WHATSAPP CHAT INPUT BAR */
          <>
            {/* 1. Left Actions: Paperclip & Camera Attachment Buttons */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                id="chat-attach-paperclip-btn"
                type="button"
                disabled={isLoading}
                onClick={() => fileInputRef.current?.click()}
                title="Upload prescription or invoice image"
                aria-label="Upload prescription or invoice image"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
              >
                <Paperclip className="h-5 w-5" />
              </button>

              <button
                id="chat-attach-camera-btn"
                type="button"
                disabled={isLoading}
                onClick={() => cameraInputRef.current?.click()}
                title="Take photo of prescription or medicine"
                aria-label="Take photo of prescription or medicine"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
              >
                <Camera className="h-5 w-5" />
              </button>
            </div>

            {/* 2. Center Text Input Pill */}
            <div
              id="chat-input-pill-container"
              className="flex flex-1 items-center min-h-[42px] rounded-2xl sm:rounded-full bg-white px-3.5 py-1.5 border border-slate-200 shadow-2xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/15 transition-all"
            >
              <textarea
                id="chat-thread-input"
                ref={textareaRef}
                rows={1}
                value={inputText}
                disabled={isLoading}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isLoading
                    ? "MediNist AI is thinking..."
                    : selectedImage
                    ? "Add note or send prescription image..."
                    : "Message MediNist AI or hold to speak..."
                }
                className="w-full resize-none bg-transparent text-[13.5px] sm:text-[14px] leading-snug text-slate-900 placeholder:text-slate-400 outline-none disabled:opacity-60 max-h-[120px] overflow-y-auto"
              />
            </div>
          </>
        )}

        {/* 3. Dynamic Right Button (WhatsApp Style) */}
        {isRecording ? (
          /* Active Recording Send/Finish Button */
          <button
            id="chat-recording-send-btn"
            type="button"
            onClick={finishAndSendRecording}
            aria-label="Send voice message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-xs hover:bg-[#009272] active:scale-95 transition-all cursor-pointer animate-in zoom-in-90 duration-150"
          >
            <Send className="h-4 w-4 translate-x-px" />
          </button>
        ) : hasContentToText ? (
          /* Send Button when user is typing or has selected an image */
          <button
            id="chat-thread-send-btn"
            type="button"
            onClick={handleSend}
            disabled={isLoading}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-xs hover:bg-[#009272] active:scale-95 disabled:opacity-40 disabled:hover:bg-[#00a884] transition-all cursor-pointer animate-in zoom-in-90 duration-150"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 translate-x-px" />
            )}
          </button>
        ) : (
          /* Circular Microphone Button when text input is empty (WhatsApp style) */
          <button
            id="chat-thread-mic-btn"
            type="button"
            disabled={isLoading}
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            title="Press & hold or tap to record voice note"
            aria-label="Record voice note for MediNist AI"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-xs hover:bg-[#009272] active:scale-95 disabled:opacity-40 transition-all cursor-pointer animate-in zoom-in-90 duration-150"
          >
            <Mic className="h-5 w-5" />
          </button>
        )}
      </div>
    </footer>
  );
};

export default AIChatInputBar;
