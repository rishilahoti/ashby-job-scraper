import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#080E1A",
          borderRadius: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "#473bce",
            }}
          />
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 26,
              fontWeight: 700,
              color: "#F1F5F9",
              letterSpacing: "-1px",
            }}
          >
            AT
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
