import { useState } from "react";
import { Plus, Palette, Type, Undo2, Redo2, MoreVertical, Trash2, Copy } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useKeyboardInset } from "@/hooks/useKeyboardInsets";
import ColorPicker from "@/components/notes/ColorPicker";
import TextFormatPopover from "@/components/notes/TextFormatPopover";
import AddBlockSheet from "@/components/notes/AddBlockSheet";
import type { NoteColor } from "@/hooks/useNotes";

interface Props {
  color: NoteColor;
  onColorChange: (c: NoteColor) => void;
  isShared: boolean;
  onShareChange: (v: boolean) => void;
  onAddImage: (category: "photo" | "invoice" | "prescription") => void;
  onAddChecklist: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  exec: (cmd: string, value?: string) => void;
  canDelete: boolean;
}

const iconBtn =
  "h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-700";

const NoteKeyboardToolbar = ({
  color,
  onColorChange,
  isShared,
  onShareChange,
  onAddImage,
  onAddChecklist,
  onDelete,
  onDuplicate,
  exec,
  canDelete,
}: Props) => {
  const inset = useKeyboardInset();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <div
        className="fixed left-0 right-0 z-30 bg-white border-t border-gray-200"
        style={{
          bottom: inset > 0 ? inset : 0,
          paddingBottom:
            inset > 0 ? 0 : "env(safe-area-inset-bottom, 0px)",
          transition: "bottom 150ms ease-out",
        }}
      >
        <div className="max-w-3xl mx-auto h-12 px-2 flex items-center">
          {/* Left group: Add, Color, Text */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={iconBtn}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setAddOpen(true)}
              aria-label="Add"
            >
              <Plus size={20} />
            </button>

            <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={iconBtn}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Color"
              >
                <Palette size={18} />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="center" className="w-auto p-3">
              <ColorPicker value={color} onChange={onColorChange} />
            </PopoverContent>
            </Popover>

            <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={iconBtn}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Text format"
              >
                <Type size={18} />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="center" className="w-auto p-2">
              <TextFormatPopover exec={exec} />
            </PopoverContent>
            </Popover>
          </div>

          {/* Elegant breathing space */}
          <div className="flex-1" />

          {/* Right group: Undo, Redo, More */}
          <div className="flex items-center gap-1">
            <button
            type="button"
            className={iconBtn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("undo")}
            aria-label="Undo"
          >
            <Undo2 size={18} />
            </button>

            <button
            type="button"
            className={iconBtn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("redo")}
            aria-label="Redo"
          >
            <Redo2 size={18} />
            </button>

            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={iconBtn}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="More"
              >
                <MoreVertical size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-60">
              <div className="flex items-center justify-between px-2 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">Share with Team</p>
                  <p className="text-xs text-gray-500">
                    {isShared ? "Visible to your pharmacy" : "Private"}
                  </p>
                </div>
                <Switch checked={isShared} onCheckedChange={onShareChange} />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDuplicate}>
                <Copy size={14} className="mr-2" /> Make a copy
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onDelete}
                disabled={!canDelete}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 size={14} className="mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <AddBlockSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onAddImage={onAddImage}
        onAddChecklist={onAddChecklist}
      />
    </>
  );
};

export default NoteKeyboardToolbar;