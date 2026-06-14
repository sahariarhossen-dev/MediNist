export interface MedicineCardData {
  id: string;
  name: string;
  generic: string;
  shelf: string;
  stock: number;
  unit: string;
  price: number;
}

export interface InvoiceCardData {
  id: string;
  supplier: string;
  invoiceNo: string;
  date: string;
  total: number;
  status: "Pending" | "Paid" | "Overdue";
}

export type CardPayload =
  | { kind: "medicine"; data: MedicineCardData }
  | { kind: "invoice"; data: InvoiceCardData };

const SENTINEL = "[[card:v1]]";

export const MOCK_MEDICINES: MedicineCardData[] = [
  { id: "napa-extend-665", name: "Napa Extend 665mg", generic: "Paracetamol", shelf: "C-2", stock: 142, unit: "Boxes", price: 15.0 },
  { id: "sergel-20", name: "Sergel 20mg", generic: "Esomeprazole", shelf: "A-5", stock: 18, unit: "Strips", price: 70.0 },
  { id: "monas-10", name: "Monas 10mg", generic: "Montelukast", shelf: "B-1", stock: 0, unit: "Boxes", price: 160.0 },
];

export const MOCK_INVOICE: InvoiceCardData = {
  id: "inv-2026-0042",
  supplier: "Square Pharmaceuticals",
  invoiceNo: "INV-2026-0042",
  date: new Date().toISOString().slice(0, 10),
  total: 12450,
  status: "Pending",
};

export function buildMedicineCardContent(med: MedicineCardData): string {
  const payload: CardPayload = { kind: "medicine", data: med };
  return `${SENTINEL}${JSON.stringify(payload)}\n💊 Shared: ${med.name}`;
}

export function buildInvoiceCardContent(inv: InvoiceCardData): string {
  const payload: CardPayload = { kind: "invoice", data: inv };
  return `${SENTINEL}${JSON.stringify(payload)}\n📄 Shared invoice: ${inv.invoiceNo}`;
}

export function parseCardPayload(content: string | null | undefined): CardPayload | null {
  if (!content) return null;
  const firstLine = content.split("\n")[0];
  if (!firstLine.startsWith(SENTINEL)) return null;
  try {
    const json = firstLine.slice(SENTINEL.length);
    const parsed = JSON.parse(json) as CardPayload;
    if (parsed && (parsed.kind === "medicine" || parsed.kind === "invoice") && parsed.data) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}