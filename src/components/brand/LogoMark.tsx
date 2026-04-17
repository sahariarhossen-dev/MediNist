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
      className={`ml-0 mt-0 py-0 px-0 pt-0 pl-0 font-bold text-2xl opacity-100 object-fill pb-0 mb-0 ${className || ""}`.trim()}
      style={{ width: size, height: size, objectFit: "fill" }}
    />
  );
};

export default LogoMark;
