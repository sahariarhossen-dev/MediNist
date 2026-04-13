import { useState } from "react";
import { Key, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { setApiKey, checkConnection } from "@/lib/geminiClient";
import { toast } from "sonner";

interface Props {
  onSuccess: () => void;
}

const ApiKeySetup = ({ onSuccess }: Props) => {
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [verified, setVerified] = useState(false);

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      toast.error("Please paste your API key");
      return;
    }
    setTesting(true);
    setApiKey(trimmed);

    const { ok, error } = await checkConnection();
    setTesting(false);

    if (ok) {
      setVerified(true);
      toast.success("API key verified! Connection active ✅");
      setTimeout(onSuccess, 800);
    } else {
      localStorage.removeItem("gemini_api_key");
      toast.error(error || "Invalid API key. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm bg-[#111827] border border-[#1E293B] rounded-2xl p-6 space-y-5 shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1A8CFF] to-[#0EA5E9] flex items-center justify-center">
            <Key className="w-7 h-7 text-white" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold text-[#F1F5F9]">Connect Your AI Assistant</h2>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Paste your Google Gemini API key below to activate MediNist AI.
            Your key is stored locally in this browser only.
          </p>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your Gemini API Key here"
            className="w-full px-4 py-3 rounded-xl bg-[#0F1623] border border-[#1E293B] text-sm text-[#F1F5F9]
              placeholder:text-[#475569] outline-none focus:border-[#1A8CFF] focus:ring-1 focus:ring-[#1A8CFF]/30 transition-all"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />

          <button
            onClick={handleSave}
            disabled={!key.trim() || testing || verified}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all
              bg-gradient-to-r from-[#1A8CFF] to-[#0EA5E9] hover:from-[#1578D9] hover:to-[#0D8FD0]
              disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]
              flex items-center justify-center gap-2"
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying connection…
              </>
            ) : verified ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Connected!
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Save & Verify Key
              </>
            )}
          </button>
        </div>

        {/* Help text */}
        <div className="text-center space-y-2">
          <p className="text-[10px] text-[#475569] leading-relaxed">
            Get your free API key at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1A8CFF] underline"
            >
              aistudio.google.com/apikey
            </a>
          </p>
          <p className="text-[10px] text-[#475569] leading-relaxed">
            🔒 Your key never leaves your browser.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ApiKeySetup;
