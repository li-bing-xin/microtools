import { usePageHead } from "@/lib/head";
import type { PageDefinition } from "@/lib/pages";

/**
 * P0 的页面骨架：h1 + 导语 + 面包屑。
 *
 * 各页正文（工具说明、对比表、use-case 长文、FAQ）在 P1/P2 按页面类型接管：
 * 工具页换成编辑器 + 长文，对比页换成 ComparisonPage，use-case 换成 UseCasePage。
 * 这里刻意不写占位文案——预览产物宁可短，也不要往索引里塞假内容。
 */
export function PageView({ page }: { page: PageDefinition }) {
  usePageHead(page);

  const segments = page.path.split("/").filter(Boolean);

  return (
    <article className="page">
      {segments.length > 0 ? (
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="/">Blurface</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{page.h1}</span>
        </nav>
      ) : null}

      <header className="page-head">
        <h1>{page.h1}</h1>
        <p className="lede">{page.lede}</p>
      </header>
    </article>
  );
}
