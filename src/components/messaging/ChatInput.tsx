import { useRef, useState } from "react";
import { Plus, Send, Smile } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface Props {
  onSend: (content: string, attachment?: { url: string; type: string }) => Promise<void>;
  onTyping: () => void;
  roomId: string;
}

const EMOJIS = ["😀","😂","🥰","👍","🙏","🎉","🔥","✅","❌","💊","💉","🩺"];

const ChatInput = ({ onSend, onTyping, roomId }: Props) => {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (!text.trim()) return;
    const t = text;
    setText("");
    await onSend(t);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setUploading(true);
    try {
      const path = `${user.id}/${roomId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (error) throw error;
      const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
      await onSend("", { url: data?.signedUrl || "", type: file.type });
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-2">
      {emojiOpen && (
        <div className="flex flex-wrap gap-2 pb-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setText((t) => t + e)}
              className="text-xl hover:scale-110 transition"
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200"
          aria-label="Attach"
        >
          <Plus className="h-5 w-5" />
        </button>
        <input ref={fileRef} type="file" hidden onChange={handleFile} accept="image/*,application/pdf" />
        <button
          onClick={() => setEmojiOpen((v) => !v)}
          className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200"
          aria-label="Emoji"
        >
          <Smile className="h-5 w-5" />
        </button>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder="Type a message"
          className="flex-1 resize-none rounded-2xl bg-gray-100 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 max-h-32"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-green-500 text-white disabled:opacity-40 hover:bg-green-600"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;