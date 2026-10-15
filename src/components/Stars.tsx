export function Stars({ count, max = 3, className = "h-4 w-4" }: { count: number; max?: number; className?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${count}/${max} sao`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={className} aria-hidden>
          <path
            d="M10 1.8l2.5 5.2 5.6.8-4.1 3.9 1 5.6L10 14.6l-5 2.7 1-5.6L1.9 7.8l5.6-.8z"
            fill={i < count ? "var(--honey)" : "none"}
            stroke={i < count ? "var(--honey)" : "var(--grid-thin)"}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}
