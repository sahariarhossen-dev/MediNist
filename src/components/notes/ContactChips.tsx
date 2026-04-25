import { useState } from "react";
import { Phone, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ContactChipsProps {
  numbers: string[];
  readOnly?: boolean;
  onChange?: (numbers: string[]) => void;
}

const ContactChips = ({ numbers, readOnly, onChange }: ContactChipsProps) => {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (numbers.includes(v)) {
      setDraft("");
      return;
    }
    onChange?.([...numbers, v]);
    setDraft("");
  };

  const remove = (n: string) => {
    onChange?.(numbers.filter((x) => x !== n));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {numbers.map((n) => (
          <div
            key={n}
            className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-full pl-3 pr-1 py-1 text-sm font-medium border border-blue-100"
          >
            <a href={`tel:${n}`} className="inline-flex items-center gap-1.5">
              <Phone size={12} />
              {n}
            </a>
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(n)}
                aria-label={`Remove ${n}`}
                className="ml-1 p-0.5 rounded-full hover:bg-blue-100"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {numbers.length === 0 && readOnly && (
          <p className="text-xs text-gray-400">No contact numbers</p>
        )}
      </div>
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            type="tel"
            inputMode="tel"
            placeholder="Add phone number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="h-9"
          />
          <Button type="button" size="sm" onClick={add} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Plus size={16} />
          </Button>
        </div>
      )}
    </div>
  );
};

export default ContactChips;