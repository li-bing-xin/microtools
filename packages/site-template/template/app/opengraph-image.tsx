import { ImageResponse } from "next/og";
import { site } from "@/lib/site";
import { tool } from "@/lib/tool";

export const alt = `${site.name} — ${tool.h1}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** 自包含 OG 图：构建期生成，不拉外部字体/图片（隐私与构建稳定性）。 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #0b1220 0%, #17264a 60%, #1d3a6e 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 4 }}>
          {site.name.toUpperCase()}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: tool.h1.length > 34 ? 60 : 76,
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: -1,
          }}
        >
          {tool.h1}
        </div>
        <div style={{ display: "flex", fontSize: 30, opacity: 0.78 }}>
          Free · no watermark · runs in your browser
        </div>
      </div>
    ),
    size,
  );
}
