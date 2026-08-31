import { supabase } from "@/integrations/supabase/client";

export interface InlineImage {
  /** Base64 payload without the data-URL prefix. */
  data: string;
  mimeType: string;
  /** Object/data URL used only for the local thumbnail preview. */
  preview: string;
  name: string;
}

/**
 * Downscale a picked photo (prescription / invoice) and return base64 JPEG so the
 * payload stays well under the edge function limit.
 */
export const fileToInlineImage = (file: File, maxSide = 1600): Promise<InlineImage> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read the image."));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process the image."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve({
          data: dataUrl.replace(/^data:[^;]+;base64,/, ""),
          mimeType: "image/jpeg",
          preview: dataUrl,
          name: file.name || "attachment.jpg",
        });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

/** Pick the best supported MediaRecorder mime type for this browser. */
const pickAudioMime = () => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
};

export interface VoiceRecorder {
  /** Resolves with the recorded audio blob (null when nothing was captured). */
  stop: () => Promise<Blob | null>;
  cancel: () => void;
}

export const startVoiceRecording = async (): Promise<VoiceRecorder> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickAudioMime();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  const cleanup = () => stream.getTracks().forEach((t) => t.stop());

  return {
    stop: () =>
      new Promise<Blob | null>((resolve) => {
        if (recorder.state === "inactive") {
          cleanup();
          resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
          return;
        }
        recorder.onstop = () => {
          cleanup();
          resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
        };
        recorder.stop();
      }),
    cancel: () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } finally {
        cleanup();
      }
    },
  };
};

/** Send a recording to the Groq Whisper edge function and return the transcript. */
export const transcribeAudio = async (blob: Blob): Promise<string> => {
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("file", new File([blob], `voice.${ext}`, { type: blob.type || "audio/webm" }));
  form.append("language", "bn");

  const { data, error } = await supabase.functions.invoke("voice-transcribe", { body: form });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return typeof data?.text === "string" ? data.text : "";
};
