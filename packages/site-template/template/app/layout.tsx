import type { Metadata } from "next";
import "./globals.css";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  // 页面级 metadata 一律来自 buildPageMetadata（title 用 { absolute }），
  // 这里的 template 只是兜底，避免出现裸 title。
  title: { default: site.name, template: `%s | ${site.name}` },
  description: `${site.name} — free browser-based tools. Nothing is uploaded.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a className="brand" href="/">
            {site.name}
          </a>
          <nav aria-label="Primary">
            <a href="/privacy">Privacy</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <p>Processed locally in your browser — nothing is uploaded.</p>
          <p>
            <a href="/privacy">Privacy</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
