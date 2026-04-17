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
        className="font-bold tracking-tight text-[#2463eb] text-2xl"
        style={{
          lineHeight: 1,
          letterSpacing: "-0.01em",
        }}
      >
        MediNist
      </span>
    </div>
  );
};

export default LogoFull;
