import { Link, Outlet } from "@tanstack/react-router";
import { TOOL_LINKS } from "@/lib/link-graph";
import { site } from "@/lib/site";

/**
 * 全站壳：header / main / footer 都在这里，页面只负责正文。
 * 不加全局 <html> —— 静态 HTML 的文档壳由 prerender 拼接，React 只 hydration #root。
 *
 * 页脚是全站内链的兜底入口（link-graph.ts 单一真源）：任何新页都必须进 TOOL_LINKS
 * 或在这里可达，不然就是「发了新页但全站没有入口」的孤岛。
 */
export function RootLayout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" to="/">
          {site.name}
        </Link>
        <nav aria-label="Primary">
          {TOOL_LINKS.map((link) => (
            <Link key={link.path} to={link.path}>
              {link.label}
            </Link>
          ))}
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>Processed locally in your browser — nothing is uploaded.</p>
        <nav aria-label="Footer">
          {TOOL_LINKS.map((link) => (
            <Link key={link.path} to={link.path}>
              {link.label}
            </Link>
          ))}
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </footer>
    </>
  );
}
