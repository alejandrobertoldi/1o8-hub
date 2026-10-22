import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#52525b",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#eab308",
            letterSpacing: -1,
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
