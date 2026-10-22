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
          background: "#52525b",
          borderRadius: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: 88,
            fontWeight: 800,
            color: "#eab308",
            letterSpacing: -4,
            lineHeight: 1,
          }}
        >
          108
        </span>
      </div>
    ),
    { ...size }
  );
}
