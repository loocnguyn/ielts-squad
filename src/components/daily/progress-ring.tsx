/** A ring meter: the track is a faint step of the same hue as the fill. */
export function ProgressRing({
  value,
  color,
  size = 112,
  stroke = 9,
  label,
  children,
}: {
  /** 0 to 1. */
  value: number;
  color: string;
  size?: number;
  stroke?: number;
  label: string;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-full -rotate-90"
        role="img"
        aria-label={label}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`color-mix(in oklch, ${color} 18%, transparent)`}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
          opacity={clamped === 0 ? 0 : 1}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
