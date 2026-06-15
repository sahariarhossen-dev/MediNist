import logoSrc from "@/assets/medinist-logo.png";

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * Icon-only MediNist mark — renders at 2x intrinsic resolution
 * for crisp display on high-DPI screens.
 */
const LogoMark = ({ size = 32, className }: LogoMarkProps) => {
  return (
    <img
      src={logoSrc}
      alt="MediNist logo"
      width={size * 2}
      height={size * 2}
      draggable={false}
      decoding="async"
      className={`shrink-0 select-none object-contain ${className ?? ""}`.trim()}
      style={{ width: size, height: size }}
    />
  );
};

export default LogoMark;
