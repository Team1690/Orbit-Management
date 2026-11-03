// The app icon, drawn for next/og's ImageResponse (PNG output for iOS and Android).
export function AppIconImage({ size, rounded = false }: { size: number; rounded?: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #2450e6 0%, #0f1e5c 100%)",
        borderRadius: rounded ? size * 0.22 : 0,
      }}
    >
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 32 32">
        <ellipse cx="16" cy="16" rx="13" ry="5.4" fill="none" stroke="#ffffff" strokeWidth="2.2" transform="rotate(-30 16 16)" />
        <circle cx="16" cy="16" r="5" fill="#ffffff" />
        <circle cx="26.6" cy="9.9" r="2.4" fill="#fbbf24" />
      </svg>
    </div>
  );
}
