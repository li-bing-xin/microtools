import type { FaqItem, JsonLd } from "./types";

/**
 * FAQPage schema。必须用「渲染可见 FAQ 的同一个数组」构建——
 * 结构化数据与页面内容不一致会被判为垃圾结构化数据。
 */
export function faqPageJsonLd(items: FaqItem[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export interface WebApplicationInput {
  name: string;
  description: string;
  url: string;
  applicationCategory?: string;
  operatingSystem?: string;
  /** 免费工具固定输出 0 价 Offer；有付费层时传真实起步价。 */
  price?: string;
  priceCurrency?: string;
  featureList?: string[];
}

/** 工具页 WebApplication schema。默认标记为免费可用。 */
export function webApplicationJsonLd(input: WebApplicationInput): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: input.name,
    description: input.description,
    url: input.url,
    applicationCategory: input.applicationCategory ?? "MultimediaApplication",
    operatingSystem: input.operatingSystem ?? "Any (browser-based)",
    browserRequirements: "Requires JavaScript. Runs entirely in the browser.",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: input.price ?? "0",
      priceCurrency: input.priceCurrency ?? "USD",
    },
    ...(input.featureList ? { featureList: input.featureList } : {}),
  };
}

/** 多段 JSON-LD 用 @graph 合并，一次输出，避免多个 <script> 块。 */
export function jsonLdGraph(nodes: JsonLd[]): JsonLd {
  return { "@context": "https://schema.org", "@graph": nodes.map(({ "@context": _drop, ...rest }) => rest) };
}
