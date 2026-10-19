# @microtools/site-template

单用途工具站脚手架：Next.js App Router + TS，全静态、零服务端运行时。

```bash
pnpm new-site pixelate --domain https://pixelate.example --name "Pixelate"
# 等价于
node packages/site-template/bin/create-site.mjs pixelate --domain https://pixelate.example --name "Pixelate"
```

生成 `apps/pixelate/`，再 `pnpm install` 即可 `pnpm --filter pixelate dev`。

## 模板自带什么

| 文件 | 作用 |
|---|---|
| `lib/site.ts` | 站点常量（域名 / 品牌） |
| `lib/tool.ts` | 唯工具的 title / description / H1 / 三步 how-to / `live` 开关 |
| `lib/faq.ts` | 3–5 条 FAQ，同一数组喂可见内容与 FAQPage schema |
| `app/page.tsx` | 首屏工具槽 + how-to + FAQ + WebApplication/FAQPage JSON-LD |
| `app/sitemap.ts` | 只收录 `live` 页面 |
| `app/robots.ts` | 指向 sitemap |
| `app/privacy/page.tsx` | 「本地处理、不上传」隐私表述（卖点也是合规底线） |
| `app/opengraph-image.tsx` | 构建期生成的 1200×630 OG 图，不拉外部字体 |
| `components/ToolSlot.tsx` | 编辑器挂载点，新站替换为真实工具 |

## 模板故意不给的东西

- 不加 `next/font/google`（构建期外网依赖 + 隐私噪音），用系统字体栈。
- 不开 `next/image` 优化器（BING-16/17：Workers 上优化器 500 会全站裂图）。
- 不放博客/文章目录：薄文本页是核心更新的打击面，工具站靠工具本体吃排名。
- 不预置分析脚本：变现与统计要过成员 gate，代码里先留空。

## `live` 开关

`lib/tool.ts` 的 `live: false` 同时意味着 `noindex` 与「不进 sitemap」。工具真正可用前不要翻这个开关——空壳页被索引是最贵的返工。
