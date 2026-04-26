import { Menu, Search, LayoutGrid, Rows } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NoteSearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onMenuClick: () => void;
  view: "masonry" | "list";
  onToggleView: () => void;
  avatarUrl?: string | null;
  avatarFallback?: string;
  onAvatarClick?: () => void;
  placeholder?: string;
}

const NoteSearchBar = ({
  value,
  onChange,
  onMenuClick,
  view,
  onToggleView,
  avatarUrl,
  avatarFallback,
  onAvatarClick,
  placeholder,
}: NoteSearchBarProps) => {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex items-center bg-white rounded-full border border-gray-200 shadow-sm h-12 px-2">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
        >
          <Menu size={20} />
        </button>

        <Search size={16} className="text-gray-400 ml-1 mr-2 flex-shrink-0" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Search your notes"}
          className="flex-1 bg-transparent outline-none text-sm text-gray-800 placeholder:text-gray-400 min-w-0"
        />

        <button
          type="button"
          onClick={onToggleView}
          aria-label="Toggle view"
          className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
        >
          {view === "masonry" ? <Rows size={18} /> : <LayoutGrid size={18} />}
        </button>
      </div>

      <button
        type="button"
        onClick={onAvatarClick}
        aria-label="Profile"
        className="flex-shrink-0"
      >
        <Avatar className="h-9 w-9 ring-1 ring-gray-200">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="Profile" /> : null}
          <AvatarFallback className="bg-[#2563eb] text-white text-sm font-medium">
            {avatarFallback ?? "U"}
          </AvatarFallback>
        </Avatar>
      </button>
    </div>
  );
};

export default NoteSearchBar;
