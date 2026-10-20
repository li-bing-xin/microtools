import { Link, Outlet } from "@tanstack/react-router";
import { site } from "@/lib/site";

/**
 * 全站壳：header / main / footer 都在这里，页面只负责正文。
 * 不加全局 <html> —— 静态 HTML 的文档壳由 prerender 拼接，React 只 hydration #root。
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
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </footer>
    </>
  );
}
