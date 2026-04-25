import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

interface ChecklistItem {
  text: string;
  checked: boolean;
}

interface BlockChecklistProps {
  items: ChecklistItem[];
  readOnly?: boolean;
  onChange?: (items: ChecklistItem[]) => void;
}

const BlockChecklist = ({ items, readOnly, onChange }: BlockChecklistProps) => {
  const update = (i: number, patch: Partial<ChecklistItem>) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    onChange?.(next);
  };

  const remove = (i: number) => {
    onChange?.(items.filter((_, idx) => idx !== i));
  };

  const add = () => {
    onChange?.([...items, { text: "", checked: false }]);
  };

  return (
    <div className="space-y-2 bg-white rounded-md border border-gray-200 p-3">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <Checkbox
            checked={it.checked}
            onCheckedChange={(v) => update(i, { checked: !!v })}
            disabled={readOnly}
          />
          {readOnly ? (
            <span
              className={`flex-1 text-sm ${it.checked ? "line-through text-gray-400" : "text-gray-800"}`}
            >
              {it.text || <span className="text-gray-400">Empty item</span>}
            </span>
          ) : (
            <Input
              value={it.text}
              onChange={(e) => update(i, { text: e.target.value })}
              placeholder="List item"
              className={`h-8 flex-1 ${it.checked ? "line-through text-gray-400" : ""}`}
            />
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="p-1 text-gray-400 hover:text-red-500"
              aria-label="Remove item"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={add}
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8"
        >
          <Plus size={14} className="mr-1" /> Add item
        </Button>
      )}
    </div>
  );
};

export default BlockChecklist;