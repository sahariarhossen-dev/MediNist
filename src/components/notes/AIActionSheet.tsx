import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Sparkles, Languages, ListChecks, ChevronRight } from "lucide-react";

export type AIAction = "smart_clean" | "translate_en" | "extract_actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: AIAction) => void;
}

const tiles: Array<{
  id: AIAction;
  title: string;
  desc: string;
  Icon: typeof Sparkles;
  gradient: string;
  ring: string;
}> = [
  {
    id: "smart_clean",
    title: "Smart Clean & Format",
    desc: "Transforms messy, rapid shop notes into a highly professional, structured digital memo.",
    Icon: Sparkles,
    gradient: "from-indigo-500 to-violet-500",
    ring: "ring-indigo-100",
  },
  {
    id: "translate_en",
    title: "Translate to English",
    desc: "Instantly translates local language notes into international English formats.",
    Icon: Languages,
    gradient: "from-emerald-500 to-teal-500",
    ring: "ring-emerald-100",
  },
  {
    id: "extract_actions",
    title: "Extract Action Items",
    desc: "Scans your text and automatically extracts a checklist of pending actions/tasks.",
    Icon: ListChecks,
    gradient: "from-amber-500 to-orange-500",
    ring: "ring-amber-100",
  },
];

const AIActionSheet = ({ open, onOpenChange, onAction }: Props) => {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-3 pb-6">
        <div className="bg-white/70 backdrop-blur-xl border-b border-gray-100 -mx-3 px-4 py-3 mt-1">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 inline-flex items-center justify-center text-white shadow-sm">
              <Sparkles size={16} />
            </span>
            <div>
              <DrawerTitle className="text-base font-semibold text-gray-900">
                MediNist AI Assistant
              </DrawerTitle>
              <DrawerDescription className="text-xs text-gray-500">
                Choose an action to enhance your note
              </DrawerDescription>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          {tiles.map(({ id, title, desc, Icon, gradient, ring }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onOpenChange(false);
                onAction(id);
              }}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-white border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all ring-1 ${ring}`}
            >
              <span
                className={`h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br ${gradient} text-white inline-flex items-center justify-center shadow-sm`}
              >
                <Icon size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{title}</p>
                <p className="text-xs text-gray-500 line-clamp-2">{desc}</p>
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default AIActionSheet;