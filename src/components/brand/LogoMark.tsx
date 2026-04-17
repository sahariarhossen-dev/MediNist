interface LogoMarkProps {
  size?: number;
  className?: string;
  /** Override fill colors — useful for monochrome contexts (e.g. on dark backgrounds). */
  primary?: string;
  accent?: string;
}

/**
 * Icon-only MediNist mark: a medical cross whose lower stroke morphs into a stylized "M".
 * Square 64×64 viewBox so it scales cleanly to favicon sizes.
 */
const LogoMark = ({
  size = 32,
  className,
  primary = "#C0392B",
  accent = "#E74C3C",
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
        <linearGradient id={gradId} x1="16" y1="32" x2="48" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={primary} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
      </defs>

      {/* Horizontal arm of the medical cross */}
      <rect x="8" y="22" width="48" height="14" rx="4" fill={primary} />
      {/* Upper vertical arm */}
      <rect x="25" y="6" width="14" height="22" rx="4" fill={primary} />

      {/* Lower stroke morphs into a stylized "M" */}
      <path
        d="M16 36 L20 58 Q20.5 60 22.5 60 L26 60 Q28 60 28 58 L28 46 L31.2 56 Q32 58 33 58 Q34 58 34.8 56 L38 46 L38 58 Q38 60 40 60 L43.5 60 Q45.5 60 46 58 L50 36 Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
};

export default LogoMark;
