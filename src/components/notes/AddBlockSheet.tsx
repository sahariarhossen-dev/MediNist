import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Image as ImageIcon, Receipt, FileText, ListChecks } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddImage: (category: "photo" | "invoice" | "prescription") => void;
  onAddChecklist: () => void;
}

const row =
  "w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 text-left";

const AddBlockSheet = ({ open, onOpenChange, onAddImage, onAddChecklist }: Props) => {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-3 pb-6">
        <DrawerTitle className="sr-only">Add to note</DrawerTitle>
        <div className="mt-2 space-y-1">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onAddImage("photo");
            }}
            className={row}
          >
            <span className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 inline-flex items-center justify-center">
              <ImageIcon size={18} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Add Image / Invoice</p>
              <p className="text-xs text-gray-500">Upload a photo, invoice or prescription</p>
            </div>
          </button>

          <div className="flex gap-2 pl-14 pr-2 pb-1">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onAddImage("invoice");
              }}
              className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1"
            >
              <Receipt size={12} /> Invoice
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onAddImage("prescription");
              }}
              className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 inline-flex items-center gap-1"
            >
              <FileText size={12} /> Rx
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onAddChecklist();
            }}
            className={row}
          >
            <span className="h-10 w-10 rounded-full bg-sky-50 text-sky-600 inline-flex items-center justify-center">
              <ListChecks size={18} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Checkboxes</p>
              <p className="text-xs text-gray-500">Add a tickable checklist</p>
            </div>
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default AddBlockSheet;