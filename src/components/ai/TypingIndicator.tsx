import LogoMark from "@/components/brand/LogoMark";

const TypingIndicator = () => (
  <div className="flex w-full animate-fade-in-up justify-start gap-2.5">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-100 bg-white shadow-sm">
      <LogoMark size={22} />
    </div>
    <div className="flex items-center gap-1 rounded-2xl rounded-tl-none border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
    </div>
  </div>
);

export default TypingIndicator;
