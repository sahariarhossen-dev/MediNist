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
    <div className={`flex items-center ${className ?? ""}`}>
      <span
        className="font-bold tracking-tight"
        style={{
          fontSize: Math.round(height * 0.72),
          lineHeight: 1,
          color: "#1E3A8A",
          letterSpacing: "-0.01em",
        }}
      >
        MediNist
      </span>
    </div>
  );
};

export default LogoFull;
