import logoSrc from "@/assets/medinist-logo.png";

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * Icon-only MediNist mark — premium blue gradient "M".
 */
const LogoMark = ({ size = 32, className }: LogoMarkProps) => {
  return (
    <img
      src={logoSrc}
      alt="MediNist logo"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
};

export default LogoMark;
