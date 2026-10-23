import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { site } from "@/lib/site";

export type PaperSize = "A4" | "Letter";

/**
 * 打印页脚里的站址：从 site.url 推导（host + 子路径，不带协议）。
 * 换自定义域只改 src/lib/site.ts 一处，打印页脚自动跟随，不再留旧域。
 */
const SITE_ADDRESS = `${new URL(site.url).host}${site.basePath === "/" ? "" : site.basePath}`;

/**
 * 打印专用文档（BING-89 B2 自 printable-studio 回灌）：portal 到 body 下的
 * `.print-root`，屏幕上隐藏，打印时 `#root { display: none }` 让打印树只剩这里的页面。
 *
 * 约定：调用方给「题面 + 答案分离」的两组 <article className="sheet">——题面页在前，
 * 答案页加 .sheet--answers 独立成页；@page 尺寸随 paper 切换（A4 / US Letter）。
 * 布局类在 src/styles/print.css；生成器自己的布局类写在自己的组件旁。
 */
export function PrintDocument({ paper, children }: { paper: PaperSize; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const element = document.createElement("div");
    element.className = "print-root";
    document.body.append(element);
    setHost(element);
    return () => {
      element.remove();
    };
  }, []);

  if (!host) return null;

  return createPortal(
    <>
      <style>{`@page { size: ${paper === "A4" ? "A4" : "letter"} portrait; margin: 10mm; }`}</style>
      {children}
    </>,
    host,
  );
}

/** 打印页脚：导流回站（免费工具的名字 + 站址来自 site.url，不硬编码域名）。 */
export function PrintFoot({ note }: { note?: string }) {
  return (
    <p className="sheet__foot">
      {note ? `${note} · ` : ""}Free printable from {site.name} · {SITE_ADDRESS}
    </p>
  );
}
