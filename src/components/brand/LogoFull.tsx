import LogoMark from "./LogoMark";

interface LogoFullProps {
  height?: number;
  className?: string;
}

/**
 * Full MediNist logo: icon + wordmark.
 * Height drives the icon size; wordmark scales proportionally.
 */
const LogoFull = ({ height = 28, className }: LogoFullProps) => {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={height} />
      <span
        className="font-bold tracking-tight"
        style={{
          fontSize: Math.round(height * 0.72),
          lineHeight: 1,
          color: "#C0392B",
          letterSpacing: "-0.01em",
        }}
      >
        MediNist
      </span>
    </div>
  );
};

export default LogoFull;
