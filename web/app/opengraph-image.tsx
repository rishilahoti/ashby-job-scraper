import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Ashby Tracker — Every AshbyHQ job in one feed";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#080E1A",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px 96px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 480,
            height: 630,
            background: "radial-gradient(circle at 70% 50%, rgba(71,59,206,0.15) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 52 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#473bce", display: "flex" }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: "#64748B", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Ashby Tracker
          </span>
        </div>

        {/* Headline line 1 */}
        <div style={{ display: "flex", gap: 18, alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 72, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-3px", lineHeight: 1.05 }}>
            Every job on
          </span>
        </div>
        {/* Headline line 2 */}
        <div style={{ display: "flex", marginBottom: 32 }}>
          <span style={{ fontSize: 72, fontWeight: 800, color: "#473bce", letterSpacing: "-3px", lineHeight: 1.05 }}>
            AshbyHQ
          </span>
          <span style={{ fontSize: 72, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-3px", lineHeight: 1.05, marginLeft: 18 }}>
            in one feed
          </span>
        </div>

        {/* Sub */}
        <div style={{ display: "flex" }}>
          <span style={{ fontSize: 24, color: "#64748B", lineHeight: 1.5, fontWeight: 400 }}>
            135+ top tech startups · Updated every 48 hours
          </span>
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 96,
            width: 320,
            height: 2,
            background: "#473bce",
            borderRadius: 2,
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
