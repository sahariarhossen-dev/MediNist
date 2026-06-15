import LogoMark from "@/components/brand/LogoMark";

const TypingIndicator = () => (
  <div className="flex w-full animate-fade-in-up items-start justify-start gap-3">
    <LogoMark size={28} className="mt-0.5 h-7 w-7" />
    <div className="flex items-center gap-1.5 pt-2.5">
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
    </div>
  </div>
);

export default TypingIndicator;
