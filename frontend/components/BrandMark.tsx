/** TollRoad mark — a metered lane: dashed road line through a toll gate. */
export default function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="24"
        height="24"
        rx="5"
        stroke="var(--amber)"
        strokeWidth="1.6"
      />
      {/* receding lane dashes */}
      <path
        d="M13 21 L13 18"
        stroke="var(--amber)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M13 15.5 L13 12.5"
        stroke="var(--amber)"
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M13 10.5 L13 8.2"
        stroke="var(--amber)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* meter dot */}
      <circle cx="13" cy="5" r="1.5" fill="var(--meter-green)" />
    </svg>
  );
}
