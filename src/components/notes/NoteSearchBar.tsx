import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface NoteSearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const NoteSearchBar = ({ value, onChange, placeholder }: NoteSearchBarProps) => {
  return (
    <div className="relative">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search notes, tags, or creator..."}
        className="pl-9 h-10 bg-white border-gray-200 rounded-xl"
      />
    </div>
  );
};

export default NoteSearchBar;