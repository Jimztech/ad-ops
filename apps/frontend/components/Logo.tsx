export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#5a5bf0" />
      <path d="M9 24 L16 18 L22 22 L31 13" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="18" r="2.2" fill="#fff" />
      <circle cx="31" cy="13" r="2.2" fill="#fff" />
    </svg>
  );
}