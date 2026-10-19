/**
 * 站点唯一工具的页面定义（单用途工具站：首页就是工具页）。
 *
 * 新站第一件事：用目标词族重写下面所有字符串，正文必须人工写，
 * 禁止用 AI 填充文本凑字数（2024/3 核心更新打击面）。
 */
export interface ToolPage {
  slug: string;
  path: string;
  /** 不含品牌后缀的 SEO title。 */
  title: string;
  description: string;
  h1: string;
  /** 一句话卖点，用于首屏副标题与卡片。 */
  tagline: string;
  /**
   * false → noindex + 不进 sitemap。只在工具本体真的可用后才置 true。
   */
  live: boolean;
  /** 三步 how-to，150–250 词，写在正文里。 */
  steps: [string, string, string];
}

export const tool: ToolPage = {
  slug: "main-tool",
  path: "/",
  title: "Replace With the Target Keyword Phrase",
  description:
    "One sentence: what the tool does, that it is free, has no watermark, and never uploads the file.",
  h1: "Do the Job Online — Free & No Upload",
  tagline: "Processed locally in your browser — nothing is uploaded.",
  live: false,
  steps: [
    "Add your file — drag and drop, pick one, or paste it. Nothing is uploaded to a server.",
    "Adjust the result in the live preview until it looks right.",
    "Download the finished file — free, no watermark, no sign-up, metadata stripped.",
  ],
};
