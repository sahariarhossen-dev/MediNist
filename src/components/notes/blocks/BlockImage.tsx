import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { getNoteAttachmentUrl } from "@/lib/notesStorage";
import { Sparkles } from "lucide-react";

interface BlockImageProps {
  url: string;
  path: string;
  caption?: string;
  category?: "invoice" | "prescription" | "photo";
  readOnly?: boolean;
  onChange?: (patch: { caption?: string }) => void;
  onScan?: () => void;
  scanning?: boolean;
}

const categoryStyles: Record<string, string> = {
  invoice: "bg-emerald-100 text-emerald-700",
  prescription: "bg-violet-100 text-violet-700",
  photo: "bg-gray-100 text-gray-700",
};

const BlockImage = ({
  url,
  path,
  caption,
  category,
  readOnly,
  onChange,
  onScan,
  scanning,
}: BlockImageProps) => {
  const [src, setSrc] = useState(url);

  useEffect(() => {
    // Refresh signed URL on mount in case stored URL is expired
    let active = true;
    getNoteAttachmentUrl(path).then((u) => {
      if (active && u) setSrc(u);
    });
    return () => {
      active = false;
    };
  }, [path]);

  return (
    <div className="space-y-2 bg-white rounded-md border border-gray-200 p-2">
      <div className="relative overflow-hidden rounded-md">
        <img
          src={src}
          alt={caption || category || "attachment"}
          loading="lazy"
          className={`w-full h-auto rounded-md object-cover max-h-80 transition-all ${
            scanning ? "ring-2 ring-indigo-300/70 brightness-95" : ""
          }`}
        />
        {category && (
          <span
            className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full ${categoryStyles[category] ?? categoryStyles.photo}`}
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </span>
        )}
        {scanning && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-indigo-500/5" />
            <div
              className="pointer-events-none absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scanner-sweep"
              style={{ boxShadow: "0 0 12px 2px rgba(99,102,241,0.6)" }}
            />
          </>
        )}
      </div>
      {readOnly ? (
        caption ? <p className="text-xs text-gray-500 px-1">{caption}</p> : null
      ) : (
        <Input
          value={caption ?? ""}
          onChange={(e) => onChange?.({ caption: e.target.value })}
          placeholder="Add caption (optional)"
          className="h-8 text-xs"
        />
      )}
      {!readOnly && onScan && (
        <button
          type="button"
          onClick={onScan}
          disabled={scanning}
          className={`w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-full border text-xs font-medium transition-colors ${
            scanning
              ? "bg-indigo-100 text-indigo-700 border-indigo-200 cursor-wait"
              : "bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 border-indigo-100"
          }`}
        >
          {scanning ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
              <span>🔍 Scanning medicine details...</span>
            </>
          ) : (
            <>
              <Sparkles size={14} className="text-indigo-500" />
              <span>Scan with MediNist AI</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default BlockImage;