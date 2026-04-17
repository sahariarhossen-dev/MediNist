interface LogoMarkProps {
  size?: number;
  className?: string;
  /** Override fill colors — useful for monochrome contexts (e.g. on dark backgrounds). */
  primary?: string;
  accent?: string;
}

/**
 * Icon-only MediNist mark: a clean ribbon-style "M" in brand blue.
 * Square 64×64 viewBox so it scales cleanly to favicon sizes.
 */
const LogoMark = ({
  size = 32,
  className,
  primary = "#2563EB",
  accent = "#3B82F6",
}: LogoMarkProps) => {
  const gradId = `medinist-mark-grad-${primary.replace("#", "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="MediNist logo"
      role="img"
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="12" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={primary} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
      </defs>

      {/* Stylized ribbon "M": two outer legs + center V */}
      <path
        d="M8 56 L8 12 L20 12 L32 40 L44 12 L56 12 L56 56 L46 56 L46 30 L34 52 L30 52 L18 30 L18 56 Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
};

export default LogoMark;
