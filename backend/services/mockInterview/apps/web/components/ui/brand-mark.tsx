/**
 * <BrandMark> — the small-context DeepInterview mark ("Di" as pure geometry,
 * the i's tittle as the indigo speaking dot). Inline SVG so it renders
 * identically everywhere — no font dependency, no asset request. The
 * large-context variant (with the prep → interview → feedback loop arc)
 * lives in assets/logo.svg for the README hero and big lockups.
 */
export function BrandMark({
  size = 22,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="6" y="6" width="128" height="128" rx="30" fill="#FBF9F4" />
      <rect
        x="6.75"
        y="6.75"
        width="126.5"
        height="126.5"
        rx="29.25"
        fill="none"
        stroke="#1A1A1A"
        strokeWidth="1.5"
      />
      <path
        d="M38 40 H56 A30 30 0 0 1 56 100 H38 Z"
        fill="none"
        stroke="#1A1A1A"
        strokeWidth="10"
        strokeLinejoin="round"
      />
      <path
        d="M101 62 V100"
        stroke="#1A1A1A"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <circle cx="101" cy="45" r="6.5" fill="#4338CA" />
    </svg>
  );
}
