import {
  absoluteUrl,
  fullTitle,
  jsonLdGraph,
  webApplicationJsonLd,
  type JsonLd,
  type SiteConfig,
  type SitemapEntry,
} from "@microtools/seo-kit";

/**
 * 公开路由清单：预渲染、head、sitemap 三处共用这一份数据。
 *
 * 迁移自 blurface 的 `lib/tools.ts` + `lib/content-pages.ts`（Next 版），
 * 15 条 URL 与线上逐条对应：首页 + privacy + 4 个工具页 + 3 个对比页 + 6 个 use-case 页。
 *
 * 与模板的差别（迁移必须保留的线上形态）：
 * - `type`：对比页与 use-case 页的 og:type 是 article，其余 website；
 * - `ogImage`：use-case 页线上**没有** OG 图，必须显式 null（不能让 seo-kit 套默认路径）；
 * - `languages`：首页与 privacy 线上没有 hreflang（页面级 alternates 覆盖了 layout），其余 13 条有。
 *
 * 正文（工具说明、对比表、use-case 长文）在 P1/P2 随页面组件搬入；
 * 本文件只负责「URL 集合 + head + sitemap」这一层，所以标题/描述一字不改照抄线上。
 */
export interface PageDefinition {
  path: string;
  /** 不含品牌后缀的 title；最终 title 由 seo-kit 拼。 */
  title: string;
  description: string;
  /** 页面 h1。预渲染产物必须带真实 h1（verify-prerender-output 会查）。 */
  h1: string;
  /** 导语，首屏正文的第一段。 */
  lede: string;
  live: boolean;
  /** og:type。 */
  type?: "website" | "article";
  /** OG 图路径；null 表示这页没有 OG 图（use-case 页线上就是这样）。 */
  ogImage?: string | null;
  /** hreflang 集合；缺省表示不输出 alternate（首页 / privacy）。 */
  languages?: string[];
  sitemap: {
    priority: number;
    changeFrequency: NonNullable<SitemapEntry["changeFrequency"]>;
  };
  jsonLd?: (site: SiteConfig) => JsonLd;
}

/** 普通内容页的最小结构化数据：WebPage + 所属 WebSite。 */
function webPageJsonLd(
  site: SiteConfig,
  page: { path: string; title: string; description: string },
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: fullTitle(site, page.title),
    description: page.description,
    url: absoluteUrl(site, page.path),
    isPartOf: { "@type": "WebSite", name: site.name, url: site.url },
  };
}

/** 对比页的 Article 节点；datePublished/dateModified 取页面上可见的 checked 日期。 */
function articleJsonLd(
  site: SiteConfig,
  page: { path: string; title: string; description: string },
  checked: string,
): JsonLd {
  const url = absoluteUrl(site, page.path);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    datePublished: checked,
    dateModified: checked,
    isAccessibleForFree: true,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: site.name, url: site.url },
    publisher: { "@type": "Organization", name: site.name, url: site.url },
  };
}

/** 工具页的 WebApplication；FAQPage 在 P2 随 FAQ 正文一起接入。 */
function toolJsonLd(
  site: SiteConfig,
  page: { path: string; title: string; description: string },
  toolName: string,
): JsonLd {
  return jsonLdGraph([
    webApplicationJsonLd({
      name: `${site.name} — ${toolName}`,
      description: page.description,
      url: absoluteUrl(site, page.path),
    }),
  ]);
}

/* ------------------------------------------------------------------ 首页 */

export const homePage: PageDefinition = {
  path: "/",
  title: "Free Video Face Blur Online — No Watermark, No Upload",
  description:
    "Blur or pixelate faces in videos right in your browser. Automatic face detection, frame-by-frame boxes, MP4 export — free, no watermark, no sign-up, and your video never leaves your device.",
  h1: "Blur Faces in Videos Online — Free, No Watermark",
  lede:
    "Detect and censor every face frame by frame, then export an MP4 with the audio kept. The file never leaves this tab.",
  live: true,
  type: "website",
  ogImage: "/opengraph-image",
  sitemap: { priority: 1, changeFrequency: "weekly" },
  jsonLd: (site) => toolJsonLd(site, homePage, "Blur Faces in Videos"),
};

/* --------------------------------------------------------------- 法务页 */

export const privacyPage: PageDefinition = {
  path: "/privacy",
  title: "Privacy",
  description:
    "How Blurface handles your data: every tool runs locally in your browser — images and PDFs are never uploaded to a server.",
  h1: "Privacy",
  lede: "Your files never leave your device. Blurface tools run entirely in your browser.",
  live: true,
  type: "website",
  ogImage: "/opengraph-image",
  sitemap: { priority: 0.3, changeFrequency: "yearly" },
  jsonLd: (site) => webPageJsonLd(site, privacyPage),
};

/* --------------------------------------------------------------- 工具页 */

interface ToolSeed {
  slug: string;
  /** 工具短名，进 WebApplication.name（线上是 "Blurface — Blur Faces in Photos"）。 */
  name: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
}

/** 4 个工具页的文案，逐字取自线上 `lib/tools.ts`（含 em dash）。 */
const TOOLS: ToolSeed[] = [
  {
    slug: "blur-face-in-photo",
    name: "Blur Faces in Photos",
    path: "/blur-face-in-photo",
    title: "Blur Faces in Photos Online Free — No Upload",
    description:
      "Blur or pixelate faces in any photo right in your browser. Free, no watermark, no sign-up — your images never leave your device.",
    h1: "Blur Faces in Photos Online — Free & No Upload",
    lede: "Auto-detect faces, then blur or pixelate them. Free, no watermark, nothing uploaded.",
  },
  {
    slug: "blur-license-plate",
    name: "Blur License Plates",
    path: "/blur-license-plate",
    title: "Blur License Plate in Photos Online Free",
    description:
      "Auto-detect and pixelate a license plate in any photo, right in your browser. Free, no upload, no watermark — for car listings, dashcams and more.",
    h1: "Blur License Plates in Photos Online — Free & No Upload",
    lede:
      "Detect plates automatically or drag a box — pixelate or blur them before you share. For car listings, dashcam stills and street photography.",
  },
  {
    slug: "pixelate-image",
    name: "Pixelate Image",
    path: "/pixelate-image",
    title: "Pixelate Image Online Free — Censor Any Area",
    description:
      "Pixelate or mosaic any part of an image in your browser. Free, no upload, no sign-up — nothing leaves your device.",
    h1: "Pixelate Any Part of an Image Online — Free",
    lede:
      "Drag boxes over anything sensitive — faces, plates, screens, documents — and render them as a classic mosaic.",
  },
  {
    slug: "redact-pdf",
    name: "Redact PDF",
    path: "/redact-pdf",
    title: "Redact PDF Online Free — True Redaction, No Upload",
    description:
      "Truly redact a PDF in your browser: emails, phone numbers, IBANs, card numbers and IDs are found in the text layer and listed for review, then every page is rebuilt as an image so redacted text is really gone. Free up to 20 pages / 25 MB, no upload, no watermark.",
    h1: "Redact a PDF Online — True Redaction, No Upload",
    lede:
      "True redaction: pages are rebuilt as images so redacted text is really gone — not just covered by a black box.",
  },
];

/* ------------------------------------------------------------- 对比页 */

/** 竞品对比页，文案取自线上 `COMPARISON_PAGES`。 */
const COMPARISONS = [
  {
    path: "/alternatives/blur-me",
    title: "Blur.me Alternative — No Upload, No Watermark, Free",
    description:
      "Compare Blurface and blur.me: local vs uploaded processing, free limits, watermark, batch and PDF. Every competitor fact sourced and checked 19 Oct 2026.",
    h1: "A blur.me alternative that never uploads your file",
    lede: "Free-tier caps, watermark, batch processing and PDF Studio, side by side.",
    checked: "2026-10-19",
  },
  {
    path: "/alternatives/youblur",
    title: "YouBlur Alternative — No Account, No Upload",
    description:
      "Compare Blurface and YouBlur: accounts, credit packs, free lifetime limits and where files are processed. Sources checked 19 Oct 2026.",
    h1: "A YouBlur alternative with no account and no credit maths",
    lede: "Accounts, credit packs, the 10-job free cap and upload/storage, explained.",
    checked: "2026-10-19",
  },
  {
    path: "/alternatives/capcut-blur-face",
    title: "CapCut Blur Face Alternative — No Timeline, No Upload",
    description:
      "Compare a dedicated local face-blur tool with CapCut's mask-and-track editor workflow. Sources checked 19 Oct 2026.",
    h1: "Blur a face without CapCut's timeline",
    lede: "CapCut's effect, mask and Track mask workflow versus automatic local detection.",
    checked: "2026-10-19",
  },
];

/* ----------------------------------------------------------- use-case 页 */

/** 任务型页面，文案取自线上 `USE_CASE_PAGES`。 */
const USE_CASES = [
  {
    path: "/use-cases/dashcam-bodycam",
    title: "Blur Faces and Plates in Dashcam and Bodycam Footage",
    description:
      "Redact faces, number plates and a burned-in speed or GPS overlay in dashcam and bodycam clips. Frame by frame in the browser, MP4 export, nothing uploaded.",
    h1: "Blur faces and plates in dashcam and bodycam footage",
    lede:
      "Faces, plates and the burned-in overlay, frame by frame — and what the audio still gives away.",
  },
  {
    path: "/use-cases/schools-childcare",
    title: "Blur Children's Faces in School and Nursery Photos",
    description:
      "Redact children's faces, name badges and classroom details before a school or nursery photo goes into a newsletter. Local, no upload, EXIF stripped.",
    h1: "Blur children's faces in school and nursery photos",
    lede:
      "Faces, name badges and classroom displays — plus the consent list a blur cannot replace.",
  },
  {
    path: "/use-cases/real-estate-listings",
    title: "Blur Personal Details in Real Estate Listing Photos",
    description:
      "Listing photos leak more than faces: post, prescriptions, plates, alarm keypads. Redact them in the browser before the photos reach the portal.",
    h1: "Blur the personal details in real estate listing photos",
    lede:
      "Post, prescriptions, plates and keypads — the details sellers forget before a listing goes live.",
  },
  {
    path: "/use-cases/insurance-claims",
    title: "Redact Insurance Claim Photos and PDFs Before Sending",
    description:
      "Send a claim without handing over bank details, a signature or the other driver's phone number. Local PDF redaction, 20 pages / 25 MB, text really removed.",
    h1: "Redact a claim before it goes to the insurer",
    lede: "Strip bank details, signatures and third-party data — then prove the text is gone.",
  },
  {
    path: "/use-cases/healthcare",
    title: "Blur Patient Identifiers in Medical Photos and PDFs",
    description:
      "Redact faces, wristbands, MRNs and addresses from clinical photos and referral PDFs in the browser. What local processing covers — and what it does not.",
    h1: "Blur patient identifiers before a photo or PDF leaves the practice",
    lede:
      "Faces, wristbands and MRNs — and the honest limits of a consumer tool in a clinical workflow.",
  },
  {
    path: "/use-cases/journalism-documentary",
    title: "Blur Sources and Bystanders in Documentary Footage",
    description:
      "A frame-by-frame route for redacting faces, tattoos, plates and screens in documentary footage — and the identifiers a video blur cannot touch, like voice.",
    h1: "Blur sources and bystanders in documentary footage",
    lede:
      "Frame-by-frame redaction for interview and protest footage — and the identifiers a blur cannot reach.",
  },
];

/* ------------------------------------------------------------- 组装清单 */

const toolPages: PageDefinition[] = TOOLS.map((tool) => ({
  path: tool.path,
  title: tool.title,
  description: tool.description,
  h1: tool.h1,
  lede: tool.lede,
  live: true,
  type: "website",
  ogImage: `${tool.path}/opengraph-image`,
  languages: ["en", "x-default"],
  sitemap: { priority: 0.8, changeFrequency: "weekly" },
  jsonLd: (site) => toolJsonLd(site, tool, tool.name),
}));

const comparisonPages: PageDefinition[] = COMPARISONS.map((page) => ({
  path: page.path,
  title: page.title,
  description: page.description,
  h1: page.h1,
  lede: page.lede,
  live: true,
  type: "article",
  ogImage: `${page.path}/opengraph-image`,
  languages: ["en", "x-default"],
  sitemap: { priority: 0.7, changeFrequency: "monthly" },
  jsonLd: (site) => articleJsonLd(site, page, page.checked),
}));

const useCasePages: PageDefinition[] = USE_CASES.map((page) => ({
  path: page.path,
  title: page.title,
  description: page.description,
  h1: page.h1,
  lede: page.lede,
  live: true,
  type: "article",
  // 线上 use-case 页没有 OG 图（也没有 twitter:image），照抄而不是"顺手补齐"。
  ogImage: null,
  languages: ["en", "x-default"],
  sitemap: { priority: 0.65, changeFrequency: "monthly" },
  jsonLd: (site) => webPageJsonLd(site, page),
}));

/** 15 条，顺序与线上 sitemap 一致（home → privacy → tools → comparisons → use-cases）。 */
export const pages: readonly PageDefinition[] = [
  homePage,
  privacyPage,
  ...toolPages,
  ...comparisonPages,
  ...useCasePages,
];

export function getPage(path: string): PageDefinition {
  const page = pages.find((candidate) => candidate.path === path);
  if (!page) {
    throw new Error(
      `Unknown page "${path}". Known pages: ${pages.map((candidate) => candidate.path).join(", ")}`,
    );
  }
  return page;
}

/**
 * 静态产物路径：扁平 `*.html`，与 Next `output: "export"` 的产物形态一致。
 *
 * 模板默认是 `privacy/index.html`；改扁平是为了保住线上的尾斜杠行为
 * （`/privacy` 200 直出、`/privacy/` 307 回无斜杠），目录形态会让 `/privacy` 变成 307 → `/privacy/`。
 * scripts/lib/paths.mjs 里有一份必须保持同步的实现。
 */
export function outputPathFor(path: string): string {
  if (path === "/") return "index.html";
  return `${path.replace(/^\/+|\/+$/g, "")}.html`;
}
