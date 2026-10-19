/** 渲染 JSON-LD。数据必须与页面可见内容一致，否则会被判垃圾结构化数据。 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // 内容由本仓库构造，不含用户输入。
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
