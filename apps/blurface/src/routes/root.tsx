import { Link, Outlet } from "@tanstack/react-router";
import { pages } from "@/lib/pages";
import { site } from "@/lib/site";

/**
 * 全站壳：header / main / footer 都在这里，页面只负责正文。
 * 不加全局 <html> —— 静态 HTML 的文档壳由 prerender 拼接，React 只 hydration #root。
 *
 * 导航文案是 P0 的临时版：blurface 的 SiteNav / SiteFooter / ToolLinks 与 globals.css
 * 在 P1 整份搬入（迁移只搬不改，BING-33 的设计不在这里重做）。
 */
const NAV = [
  { path: "/", label: "Video Blur" },
  { path: "/blur-face-in-photo", label: "Blur Faces" },
  { path: "/blur-license-plate", label: "License Plates" },
  { path: "/pixelate-image", label: "Pixelate" },
  { path: "/redact-pdf", label: "Redact PDF" },
];

export function RootLayout() {
  const indexable = pages.filter((page) => page.live);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Blurface home">
          {site.name}
        </Link>
        <nav aria-label="Blurface tools">
          {NAV.map((item) => (
            <Link key={item.path} to={item.path}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>Every tool runs in your browser. Nothing is uploaded.</p>
        <nav aria-label="Footer">
          {indexable
            .filter((page) => page.path !== "/")
            .map((page) => (
              <Link key={page.path} to={page.path}>
                {page.h1}
              </Link>
            ))}
        </nav>
      </footer>
    </>
  );
}
