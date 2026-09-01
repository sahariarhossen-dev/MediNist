interface MediNistMarkProps {
  /** Rendered size in px (square). */
  size?: number;
  className?: string;
}

/**
 * Official MediNist "M" mark: minimalist dark-navy stroke with an orange
 * star accent on the top right. Pure SVG so it stays crisp at any size.
 */
const MediNistMark = ({ size = 24, className }: MediNistMarkProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    aria-hidden
    className={className}
  >
    {/* M strokes */}
    <path
      d="M14 52V17.5L32 43.5L50 17.5V52"
      stroke="#141A3C"
      strokeWidth="7.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Diagonal accent slash */}
    <path
      d="M20 40L48 20"
      stroke="#141A3C"
      strokeWidth="5"
      strokeLinecap="round"
    />
    {/* Orange star accent */}
    <path
      d="M52 12L53.7 16.3L58 18L53.7 19.7L52 24L50.3 19.7L46 18L50.3 16.3L52 12Z"
      fill="#F26B21"
    />
  </svg>
);

export default MediNistMark;
