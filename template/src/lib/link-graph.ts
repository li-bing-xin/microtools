import { tool } from "./tool";

/**
 * 全站内链的单一真源：页脚、首页工具区、互链都从这份清单取。
 * 新页面进这里 = 页脚和索引自动出现，不会出现「发了新页但全站没有入口」的孤岛
 * （printable-studio 的 link-graph 约定回灌，BING-89 B2）。
 */
export interface SiteLink {
  path: string;
  label: string;
}

/** 工具页。单用途站默认只有首页工具；长出第二、第三个工具页时在这里追加。 */
export const TOOL_LINKS: readonly SiteLink[] = [{ path: tool.path, label: tool.navLabel }];

/** 合法的站内公开路径（含法律页）。给链接渲染前做一次兜底校验。 */
export const ALL_SITE_PATHS: readonly string[] = [
  ...TOOL_LINKS.map((link) => link.path),
  "/privacy",
  "/terms",
];

export function isSitePath(path: string): boolean {
  return ALL_SITE_PATHS.includes(path);
}
