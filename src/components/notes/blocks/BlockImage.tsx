import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { getNoteAttachmentUrl } from "@/lib/notesStorage";

interface BlockImageProps {
  url: string;
  path: string;
  caption?: string;
  category?: "invoice" | "prescription" | "photo";
  readOnly?: boolean;
  onChange?: (patch: { caption?: string }) => void;
}

const categoryStyles: Record<string, string> = {
  invoice: "bg-emerald-100 text-emerald-700",
  prescription: "bg-violet-100 text-violet-700",
  photo: "bg-gray-100 text-gray-700",
};

const BlockImage = ({ url, path, caption, category, readOnly, onChange }: BlockImageProps) => {
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
      <div className="relative">
        <img
          src={src}
          alt={caption || category || "attachment"}
          loading="lazy"
          className="w-full h-auto rounded-md object-cover max-h-80"
        />
        {category && (
          <span
            className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full ${categoryStyles[category] ?? categoryStyles.photo}`}
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </span>
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
    </div>
  );
};

export default BlockImage;