import { TrendingUp, PackageSearch, Pill } from "lucide-react";

interface Props {
  onSelect: (text: string) => void;
}

const chips = [
  { label: "Today's Sales", icon: TrendingUp, text: "What is today's total sale?" },
  { label: "Low Stock", icon: PackageSearch, text: "Show me low stock items" },
  { label: "New Medicine", icon: Pill, text: "Suggest a new medicine to stock" },
];

const SuggestionChips = ({ onSelect }: Props) => (
  <div className="flex gap-2 overflow-x-auto px-3 pb-2 scrollbar-hide">
    {chips.map((c) => (
      <button
        key={c.label}
        onClick={() => onSelect(c.text)}
        className="flex items-center gap-1.5 shrink-0 rounded-full px-3.5 py-2 text-xs font-medium
          bg-[#111827] text-[#94A3B8] border border-[#1E293B] hover:border-[#1A8CFF] hover:text-[#1A8CFF]
          transition-colors duration-200"
      >
        <c.icon className="w-3.5 h-3.5" />
        {c.label}
      </button>
    ))}
  </div>
);

export default SuggestionChips;
