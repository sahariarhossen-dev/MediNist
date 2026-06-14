import { FileText, Image as ImageIcon, Pill, Receipt } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickImage: () => void;
  onPickDocument: () => void;
  onShareDrugCard: () => void;
  onShareInvoice: () => void;
}

type Row = {
  key: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  iconBg: string;
  onClick: () => void;
};

const AttachmentSheet = ({
  open,
  onOpenChange,
  onPickImage,
  onPickDocument,
  onShareDrugCard,
  onShareInvoice,
}: Props) => {
  const close = () => onOpenChange(false);

  const rows: Row[] = [
    {
      key: "image",
      icon: <ImageIcon className="h-4 w-4 text-violet-600" />,
      iconBg: "bg-violet-50",
      title: "Photo / Image",
      subtitle: "Share a picture from your gallery",
      onClick: () => {
        close();
        onPickImage();
      },
    },
    {
      key: "doc",
      icon: <FileText className="h-4 w-4 text-sky-600" />,
      iconBg: "bg-sky-50",
      title: "Document",
      subtitle: "Send a PDF or attachment",
      onClick: () => {
        close();
        onPickDocument();
      },
    },
    {
      key: "drug",
      icon: <Pill className="h-4 w-4 text-emerald-600" />,
      iconBg: "bg-emerald-50",
      title: "💊 Share Drug Card",
      subtitle: "Instantly drop live medicine inventory data into this chat",
      onClick: () => {
        close();
        onShareDrugCard();
      },
    },
    {
      key: "invoice",
      icon: <Receipt className="h-4 w-4 text-amber-600" />,
      iconBg: "bg-amber-50",
      title: "📄 Share Invoice Link",
      subtitle: "Share supply chain billing cards with teammates",
      onClick: () => {
        close();
        onShareInvoice();
      },
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">Attach to chat</SheetTitle>
        </SheetHeader>
        <ul className="mt-3 space-y-1">
          {rows.map((r) => (
            <li key={r.key}>
              <button
                onClick={r.onClick}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
              >
                <div
                  className={`h-9 w-9 rounded-lg ${r.iconBg} flex items-center justify-center shrink-0`}
                >
                  {r.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{r.subtitle}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
};

export default AttachmentSheet;