import LogoMark from "@/components/brand/LogoMark";

const TypingIndicator = () => (
  <div className="flex w-full animate-fade-in-up justify-start gap-3">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
      <LogoMark size={24} />
    </div>
    <div className="flex items-center gap-1.5 pt-3">
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
    </div>
  </div>
);

export default TypingIndicator;
