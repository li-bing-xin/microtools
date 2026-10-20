#!/usr/bin/env node
/**
 * SEO 平权对照：给两个 base URL，逐条比对同一份 URL 集合的 SEO 表面，差异输出成表。
 *
 *   node scripts/seo-parity.mjs https://blurface.dev https://blurface-vite-preview.example.workers.dev
 *   node scripts/seo-parity.mjs <prod> <preview> --crawl          # 额外爬站内链接，报 404
 *   node scripts/seo-parity.mjs <prod> <preview> --urls /,/privacy # 只比这几条（调试用）
 *   node scripts/seo-parity.mjs <prod> <preview> --allow allow.json --json
 *
 * 为什么存在：迁移（Next → Vite）时最容易掉的不是"页面打不开"，而是 title 多一个后缀、
 * canonical 少了尾斜杠、hreflang 少一条、JSON-LD 换了个类型、og:image 路径变了。
 * 这些差异人眼看 15 条页面会漏，所以全部交给脚本；差异表为空才算迁移完成。
 *
 * 比什么（每条 URL）：
 *   status / 重定向落点 / <title> / meta description / canonical / hreflang 集合 /
 *   meta robots / og:type / og:image（路径、尺寸、可访问性、content-type、真实像素）/
 *   twitter card / JSON-LD 类型集合
 * 站点级：
 *   sitemap URL 集合 + 每条 changefreq/priority（忽略 lastmod）/ robots.txt 全文 /
 *   llms.txt 全文 / 未知路径是否真 404 / 尾斜杠行为
 *
 * 另外对 target 侧做"字段不缺"校验（JSON-LD 必需字段、og:image 真能取到），
 * 这部分只影响 target，不与 prod 对比：迁移允许把线上缺的字段补齐。
 *
 * 退出码：0 无不批准差异 / 1 有差异 / 2 参数或网络错误。
 */
import { readFile } from "node:fs/promises";

const EXIT_OK = 0;
const EXIT_DIFF = 1;
const EXIT_USAGE = 2;

/* ------------------------------------------------------------------ args */

function die(message) {
  console.error(`[seo-parity] ${message}`);
  console.error(
    "usage: node scripts/seo-parity.mjs <prod-base> <target-base> [--urls a,b] [--target-urls a,b] [--crawl] [--allow <file>] [--json] [--timeout <ms>]",
  );
  process.exit(EXIT_USAGE);
}

function parseArgs(argv) {
  const opts = {
    prod: null,
    target: null,
    urls: null,
    targetUrls: null,
    crawl: false,
    allow: null,
    json: false,
    timeoutMs: 20_000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--crawl") {
      opts.crawl = true;
      continue;
    }
    if (arg === "--json") {
      opts.json = true;
      continue;
    }
    if (arg === "--urls" || arg === "--target-urls" || arg === "--allow" || arg === "--timeout") {
      const value = argv[i + 1];
      if (!value) die(`${arg} needs a value`);
      i += 1;
      if (arg === "--urls") opts.urls = splitList(value);
      else if (arg === "--target-urls") opts.targetUrls = splitList(value);
      else if (arg === "--allow") opts.allow = value;
      else {
        const ms = Number(value);
        if (!Number.isFinite(ms) || ms <= 0) die(`--timeout must be a positive number of ms`);
        opts.timeoutMs = ms;
      }
      continue;
    }
    if (arg.startsWith("-")) die(`unknown option: ${arg}`);
    if (opts.prod === null) opts.prod = normalizeBase(arg);
    else if (opts.target === null) opts.target = normalizeBase(arg);
    else die(`unexpected extra argument: ${arg}`);
  }
  if (!opts.prod || !opts.target) die("both <prod-base> and <target-base> are required");
  return opts;
}

function splitList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("/") ? item : `/${item}`));
}

/** 只保留 https 源 + 可选路径，去掉尾斜杠与查询串。 */
function normalizeBase(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    die(`not a URL: ${value}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") die(`base must be http(s): ${value}`);
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/* --------------------------------------------------------------- fetching */

async function fetchText(url, { timeoutMs, redirect = "follow" } = {}) {
  const response = await fetch(url, {
    redirect,
    headers: {
      // 别让 CDN 给对照脚本返回一份旧 HTML。
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "microtools-seo-parity",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  return {
    status: response.status,
    location: response.headers.get("location"),
    url: response.url,
    headers: response.headers,
    body,
  };
}

async function fetchHead(url, { timeoutMs } = {}) {
  const response = await fetch(url, {
    method: "GET", // 有些站对 HEAD 不给 content-type；用 GET 但只读前几 KB 更稳
    headers: { "cache-control": "no-cache", "user-agent": "microtools-seo-parity", range: "bytes=0-65535" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    bytes: buffer,
    contentLength: Number(response.headers.get("content-length") ?? buffer.length),
  };
}

/* ----------------------------------------------------------- html parsing */

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

function decodeEntities(value) {
  if (!value) return value;
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[lower] ?? match;
  });
}

function attr(tag, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag);
  return match ? decodeEntities(match[1]) : null;
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseHead(html) {
  const headHtml = html.split("</head>")[0] ?? "";
  const bodyHtml = html.slice(headHtml.length);
  const metaTags = [...headHtml.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const linkTags = [...headHtml.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);

  const metaByName = new Map();
  const metaByProperty = new Map();
  for (const tag of metaTags) {
    const content = attr(tag, "content") ?? "";
    const name = attr(tag, "name");
    const property = attr(tag, "property");
    if (name) metaByName.set(name.toLowerCase(), content);
    if (property) metaByProperty.set(property.toLowerCase(), content);
  }

  const hreflang = [];
  let canonical = null;
  for (const tag of linkTags) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    if (rel === "canonical" && canonical === null) canonical = attr(tag, "href");
    const lang = attr(tag, "hreflang");
    if (rel === "alternate" && lang) hreflang.push(`${lang.toLowerCase()} ${attr(tag, "href")}`);
  }

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(headHtml);
  const jsonLdBlocks = [...html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => m[1],
  );
  const h1Match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(bodyHtml);

  return {
    title: titleMatch ? decodeEntities(titleMatch[1]).trim() : null,
    description: metaByName.get("description") ?? null,
    robots: metaByName.get("robots") ?? null,
    ogType: metaByProperty.get("og:type") ?? null,
    ogImage: metaByProperty.get("og:image") ?? null,
    ogImageWidth: metaByProperty.get("og:image:width") ?? null,
    ogImageHeight: metaByProperty.get("og:image:height") ?? null,
    ogImageAlt: metaByProperty.get("og:image:alt") ?? null,
    twitterCard: metaByName.get("twitter:card") ?? null,
    twitterImage: metaByName.get("twitter:image") ?? null,
    canonical,
    hreflang: hreflang.sort(),
    h1: h1Match ? stripTags(h1Match[1]) : null,
    jsonLdBlocks,
  };
}

/** JSON-LD 可能是单个节点、数组，或 @graph 聚合；统一摊平成节点数组。 */
function flattenJsonLd(block) {
  let data;
  try {
    data = JSON.parse(block);
  } catch (error) {
    return { error: error.message, nodes: [] };
  }
  const nodes = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node["@graph"])) {
      node["@graph"].forEach(visit);
      return;
    }
    nodes.push(node);
  };
  visit(data);
  return { nodes };
}

/** "字段不缺"的判定标准：每种类型至少要有的字段（点号表示嵌套）。 */
const REQUIRED_JSONLD_FIELDS = {
  WebApplication: ["name", "applicationCategory", "operatingSystem", "offers.price"],
  FAQPage: ["mainEntity"],
  Article: ["headline", "description", "datePublished", "dateModified", "author", "publisher"],
  WebPage: ["name", "url"],
  WebSite: ["name", "url"],
};

function jsonLdSummary(head) {
  const types = [];
  const problems = [];
  const facts = {};
  for (const block of head.jsonLdBlocks) {
    const { nodes, error } = flattenJsonLd(block);
    if (error) {
      problems.push(`JSON-LD 不可解析：${error}`);
      continue;
    }
    for (const node of nodes) {
      const type = node["@type"];
      const list = Array.isArray(type) ? type : [type];
      for (const item of list) {
        if (!item) continue;
        types.push(item);
        facts[item] = facts[item] ?? [];
        facts[item].push(node);
        for (const field of REQUIRED_JSONLD_FIELDS[item] ?? []) {
          const value = field.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), node);
          if (value === undefined || value === null || value === "") {
            problems.push(`${item} 缺字段 ${field}`);
          }
        }
        if (item === "FAQPage" && Array.isArray(node.mainEntity)) {
          for (const question of node.mainEntity) {
            if (!question?.name || !question?.acceptedAnswer?.text) {
              problems.push("FAQPage.mainEntity 里有一条缺 name / acceptedAnswer.text");
              break;
            }
          }
        }
      }
    }
  }
  return { types: types.sort(), problems, facts };
}

/* ------------------------------------------------------------- page check */

/** og:image 里 Next 会带 `?hash` 破缓存；比路径，不比查询串。 */
function imagePath(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function pngSize(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function inspectPage(base, path, opts) {
  const requestUrl = `${base}${path === "/" ? "/" : path}`;
  const started = Date.now();
  let response;
  try {
    response = await fetchText(requestUrl, { timeoutMs: opts.timeoutMs });
  } catch (error) {
    return { path, error: error.message, requestUrl };
  }
  const head = parseHead(response.body);
  const jsonLd = jsonLdSummary(head);
  const expectedUrl = `${base}${path === "/" ? "" : path}`;
  const redirects = response.url === requestUrl ? 0 : 1;

  const check = {
    path,
    requestUrl,
    status: response.status,
    finalUrl: response.url,
    redirected: redirects > 0,
    redirectTarget: redirects > 0 ? response.url : null,
    title: head.title,
    description: head.description,
    canonical: head.canonical,
    canonicalOk: head.canonical === expectedUrl || head.canonical === `${expectedUrl}/`,
    hreflang: head.hreflang,
    robots: head.robots,
    ogType: head.ogType,
    ogImage: imagePath(head.ogImage),
    ogImageWidth: head.ogImageWidth,
    ogImageHeight: head.ogImageHeight,
    ogImageAlt: head.ogImageAlt,
    twitterCard: head.twitterCard,
    twitterImage: imagePath(head.twitterImage),
    jsonLdTypes: jsonLd.types,
    jsonLdProblems: jsonLd.problems,
    h1: head.h1,
    elapsedMs: Date.now() - started,
  };

  if (check.ogImage) {
    try {
      const image = await fetchHead(check.ogImage, { timeoutMs: opts.timeoutMs });
      const size = pngSize(image.bytes);
      check.ogImageStatus = image.status;
      check.ogImageContentType = image.contentType;
      check.ogImagePixels = size ? `${size.width}x${size.height}` : null;
    } catch (error) {
      check.ogImageStatus = `ERR ${error.message}`;
    }
  }
  return check;
}

/** 逐字段比对；值统一成字符串，null 表示"两边都没有"。 */
function comparePage(prod, target) {
  const fields = [
    ["status", prod.status, target.status],
    ["finalUrl", prod.finalUrl, target.finalUrl],
    ["title", prod.title, target.title],
    ["description", prod.description, target.description],
    ["canonical", prod.canonical, target.canonical],
    ["hreflang", prod.hreflang.join(" | "), target.hreflang.join(" | ")],
    ["robots", prod.robots, target.robots],
    ["og:type", prod.ogType, target.ogType],
    ["og:image", prod.ogImage, target.ogImage],
    ["og:image:size", `${prod.ogImageWidth}x${prod.ogImageHeight}`, `${target.ogImageWidth}x${target.ogImageHeight}`],
    ["og:image:alt", prod.ogImageAlt, target.ogImageAlt],
    ["og:image:content-type", prod.ogImageContentType, target.ogImageContentType],
    ["og:image:pixels", prod.ogImagePixels, target.ogImagePixels],
    ["twitter:card", prod.twitterCard, target.twitterCard],
    ["twitter:image", prod.twitterImage, target.twitterImage],
    ["json-ld types", prod.jsonLdTypes.join(","), target.jsonLdTypes.join(",")],
  ];
  return fields
    .filter(([, a, b]) => (a ?? null) !== (b ?? null))
    .map(([field, prodValue, targetValue]) => ({
      url: prod.path,
      field,
      prod: prodValue ?? "(none)",
      target: targetValue ?? "(none)",
    }));
}

/* ------------------------------------------------------- site-level checks */

function parseSitemap(xml) {
  const entries = [];
  for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const block = match[1];
    const get = (tag) => {
      const found = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
      return found ? found[1].trim() : null;
    };
    entries.push({
      loc: get("loc"),
      changefreq: get("changefreq"),
      priority: get("priority"),
    });
  }
  return entries;
}

function normalizeText(text) {
  return text.replace(/\r\n/g, "\n").replace(/\s+$/g, "");
}

function firstDifference(a, b) {
  const left = normalizeText(a).split("\n");
  const right = normalizeText(b).split("\n");
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) {
      return `第 ${i + 1} 行：prod=${JSON.stringify(left[i] ?? "(missing)")} target=${JSON.stringify(right[i] ?? "(missing)")}`;
    }
  }
  return null;
}

async function checkSiteLevel(prodBase, targetBase, opts) {
  const differences = [];
  const info = {};

  // sitemap
  const [prodSitemap, targetSitemap] = await Promise.all([
    fetchText(`${prodBase}/sitemap.xml`, { timeoutMs: opts.timeoutMs }).catch((error) => ({ error })),
    fetchText(`${targetBase}/sitemap.xml`, { timeoutMs: opts.timeoutMs }).catch((error) => ({ error })),
  ]);
  if (prodSitemap.error || targetSitemap.error) {
    differences.push({
      url: "/sitemap.xml",
      field: "fetch",
      prod: prodSitemap.error ? `ERR ${prodSitemap.error.message}` : prodSitemap.status,
      target: targetSitemap.error ? `ERR ${targetSitemap.error.message}` : targetSitemap.status,
    });
  } else {
    const prodEntries = parseSitemap(prodSitemap.body);
    const targetEntries = parseSitemap(targetSitemap.body);
    info.sitemapCount = `${prodEntries.length} / ${targetEntries.length}`;
    const prodMap = new Map(prodEntries.map((entry) => [entry.loc, entry]));
    const targetMap = new Map(targetEntries.map((entry) => [entry.loc, entry]));
    for (const loc of prodMap.keys()) {
      if (!targetMap.has(loc)) {
        differences.push({ url: loc, field: "sitemap", prod: "present", target: "(missing)" });
      }
    }
    for (const loc of targetMap.keys()) {
      if (!prodMap.has(loc)) {
        differences.push({ url: loc, field: "sitemap", prod: "(missing)", target: "present" });
      }
    }
    for (const [loc, prodEntry] of prodMap) {
      const targetEntry = targetMap.get(loc);
      if (!targetEntry) continue;
      if (prodEntry.changefreq !== targetEntry.changefreq) {
        differences.push({
          url: loc,
          field: "sitemap changefreq",
          prod: prodEntry.changefreq ?? "(none)",
          target: targetEntry.changefreq ?? "(none)",
        });
      }
      if (prodEntry.priority !== targetEntry.priority) {
        differences.push({
          url: loc,
          field: "sitemap priority",
          prod: prodEntry.priority ?? "(none)",
          target: targetEntry.priority ?? "(none)",
        });
      }
    }
  }

  // robots.txt / llms.txt：整文字面比对
  for (const file of ["/robots.txt", "/llms.txt"]) {
    let prod;
    let target;
    try {
      prod = await fetchText(`${prodBase}${file}`, { timeoutMs: opts.timeoutMs });
      target = await fetchText(`${targetBase}${file}`, { timeoutMs: opts.timeoutMs });
    } catch (error) {
      differences.push({ url: file, field: "fetch", prod: "?", target: `ERR ${error.message}` });
      continue;
    }
    if (prod.status !== target.status) {
      differences.push({ url: file, field: "status", prod: prod.status, target: target.status });
      continue;
    }
    if (normalizeText(prod.body) !== normalizeText(target.body)) {
      differences.push({
        url: file,
        field: "body",
        prod: "见 --json 输出的 firstDifference",
        target: firstDifference(prod.body, target.body),
      });
    }
  }

  // 未知路径：必须真 404（软 404 红线）
  const probe = `/__parity-probe-${Date.now().toString(36)}`;
  const [prod404, target404] = await Promise.all([
    fetchText(`${prodBase}${probe}`, { timeoutMs: opts.timeoutMs }),
    fetchText(`${targetBase}${probe}`, { timeoutMs: opts.timeoutMs }),
  ]);
  info.notFound = `prod ${prod404.status} / target ${target404.status}`;
  if (prod404.status !== target404.status) {
    differences.push({
      url: probe,
      field: "unknown path status",
      prod: prod404.status,
      target: target404.status,
    });
  }
  if (target404.status === 200) {
    differences.push({
      url: probe,
      field: "soft 404",
      prod: prod404.status,
      target: `${target404.status} (SPA fallback would make every unknown URL indexable)`,
    });
  }

  // 尾斜杠：Next 的 out/*.html 形态下 /x/ 会 307 到 /x
  for (const path of ["/privacy", "/use-cases/healthcare"]) {
    const [prodSlash, targetSlash] = await Promise.all([
      fetchText(`${prodBase}${path}/`, { timeoutMs: opts.timeoutMs, redirect: "manual" }),
      fetchText(`${targetBase}${path}/`, { timeoutMs: opts.timeoutMs, redirect: "manual" }),
    ]);
    const prodBehavior = `${prodSlash.status} ${prodSlash.location ? `-> ${new URL(prodSlash.location, prodBase).pathname}` : ""}`.trim();
    const targetBehavior = `${targetSlash.status} ${targetSlash.location ? `-> ${new URL(targetSlash.location, targetBase).pathname}` : ""}`.trim();
    info[`trailingSlash ${path}/`] = `prod ${prodBehavior} / target ${targetBehavior}`.trim();
    if (prodBehavior !== targetBehavior) {
      differences.push({
        url: `${path}/`,
        field: "trailing slash",
        prod: prodBehavior,
        target: targetBehavior,
      });
    }
  }

  return { differences, info };
}

/* --------------------------------------------------------------- link crawl */

async function crawlLinks(base, paths, opts) {
  const seen = new Set(paths);
  const broken = [];
  const queue = [...paths];
  while (queue.length > 0 && seen.size <= 200) {
    const batch = queue.splice(0, 5);
    const pages = await Promise.all(batch.map((path) => fetchText(`${base}${path}`, { timeoutMs: opts.timeoutMs }).catch((error) => ({ error, url: path }))));
    for (const [index, page] of pages.entries()) {
      if (page.error) {
        broken.push({ path: batch[index], status: `ERR ${page.error.message}` });
        continue;
      }
      if (page.status >= 400) {
        broken.push({ path: batch[index], status: page.status });
      }
      for (const match of page.body.matchAll(/<a\b[^>]*href="([^"]+)"/gi)) {
        let link;
        try {
          link = new URL(decodeEntities(match[1]), `${base}${batch[index]}`);
        } catch {
          continue;
        }
        if (link.origin !== new URL(base).origin) continue;
        const path = link.pathname.replace(/\/+$/, "") || "/";
        if (seen.has(path)) continue;
        seen.add(path);
        queue.push(path);
      }
    }
  }
  return { scanned: seen.size, broken };
}

/* -------------------------------------------------------------------- main */

const opts = parseArgs(process.argv.slice(2));

const allow = new Map();
if (opts.allow) {
  const parsed = JSON.parse(await readFile(opts.allow, "utf8"));
  for (const entry of parsed.differences ?? []) {
    allow.set(`${entry.url}|${entry.field}`, entry.reason ?? "(no reason given)");
  }
}

function discoveryUrls(sitemapText) {
  return parseSitemap(sitemapText).map((entry) => {
    const parsed = new URL(entry.loc);
    return parsed.pathname.replace(/\/+$/, "") || "/";
  });
}

async function main() {
  console.log(`[seo-parity] prod   ${opts.prod}`);
  console.log(`[seo-parity] target ${opts.target}\n`);

  let prodPaths = opts.urls;
  let targetPaths = opts.targetUrls ?? opts.urls;
  if (!prodPaths) {
    const sitemap = await fetchText(`${opts.prod}/sitemap.xml`, { timeoutMs: opts.timeoutMs });
    if (sitemap.status !== 200) die(`${opts.prod}/sitemap.xml -> ${sitemap.status}（prod 侧必须有 sitemap 才能自动取 URL 集合）`);
    prodPaths = discoveryUrls(sitemap.body);
    if (!targetPaths) {
      const targetSitemap = await fetchText(`${opts.target}/sitemap.xml`, { timeoutMs: opts.timeoutMs }).catch(() => null);
      targetPaths = targetSitemap && targetSitemap.status === 200 ? discoveryUrls(targetSitemap.body) : prodPaths;
    }
  }

  const differences = [];
  const perUrl = [];

  // prod 的第 i 条对 target 的第 i 条：两边 URL 集合一致时就是同一路径，
  // --urls/--target-urls 手动错位时则按位置比，用来验证脚本真的能抓到差异。
  const pairs = prodPaths.map((path, index) => ({ prod: path, target: targetPaths[index] ?? path }));

  for (let i = 0; i < pairs.length; i += 4) {
    const batch = pairs.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(async (pair) => {
        const [prod, target] = await Promise.all([
          inspectPage(opts.prod, pair.prod, opts),
          inspectPage(opts.target, pair.target, opts),
        ]);
        return { path: pair.prod, prod, target };
      }),
    );
    for (const result of results) {
      perUrl.push(result);
      if (result.prod.error || result.target.error) {
        differences.push({
          url: result.path,
          field: "fetch",
          prod: result.prod.error ?? result.prod.status,
          target: result.target.error ?? result.target.status,
        });
        continue;
      }
      differences.push(...comparePage(result.prod, result.target));
      // target 侧自身的完整性（与 prod 无关）：JSON-LD 字段不能缺
      for (const problem of result.target.jsonLdProblems) {
        differences.push({ url: result.path, field: "target JSON-LD", prod: "(n/a)", target: problem });
      }
    }
  }

  const siteLevel = await checkSiteLevel(opts.prod, opts.target, opts);
  differences.push(...siteLevel.differences);

  let crawl = null;
  if (opts.crawl) {
    crawl = await crawlLinks(opts.prod, prodPaths, opts);
  }

  /* ------------------------------------------------------------- reporting */

  const approved = [];
  const blocking = [];
  for (const difference of differences) {
    const reason = allow.get(`${difference.url}|${difference.field}`);
    if (reason) approved.push({ ...difference, reason });
    else blocking.push(difference);
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          prod: opts.prod,
          target: opts.target,
          urlCount: prodPaths.length,
          siteInfo: siteLevel.info,
          blocking,
          approved,
          crawl,
          perUrl: perUrl.map((result) => ({
            path: result.path,
            prod: result.prod,
            target: result.target,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`URL 集合：${prodPaths.length} 条（prod ${prodPaths.length} / target ${targetPaths.length}）`);
    for (const [key, value] of Object.entries(siteLevel.info)) console.log(`  ${key}: ${value}`);
    console.log("");

    const byUrl = new Map();
    for (const difference of blocking) {
      byUrl.set(difference.url, [...(byUrl.get(difference.url) ?? []), difference]);
    }
    if (blocking.length === 0) {
      console.log("差异表：空（0 条差异）");
    } else {
      console.log(`差异表：${blocking.length} 条差异，涉及 ${byUrl.size} 个 URL\n`);
      console.log("  URL".padEnd(46) + "字段".padEnd(22) + "prod → target");
      console.log("  " + "-".repeat(118));
      for (const [url, items] of byUrl) {
        for (const [index, item] of items.entries()) {
          const urlCell = index === 0 ? url : "";
          console.log(
            `  ${urlCell.padEnd(44)}${item.field.padEnd(22)}${truncate(String(item.prod), 34)} → ${truncate(String(item.target), 44)}`,
          );
        }
      }
      console.log("");
    }

    if (approved.length > 0) {
      console.log(`已批准差异：${approved.length} 条`);
      for (const item of approved) {
        console.log(`  ${item.url} · ${item.field} — ${item.reason}`);
      }
      console.log("");
    }

    if (crawl) {
      console.log(`站内爬取：${crawl.scanned} 个路径，404 ${crawl.broken.length} 个`);
      for (const item of crawl.broken.slice(0, 20)) console.log(`  ${item.status}  ${item.path}`);
      console.log("");
    }

    const ogMissing = perUrl.filter((result) => result.target.ogImage && result.target.ogImageStatus !== 200);
    if (ogMissing.length > 0) {
      console.log(`target 的 og:image 取不到：${ogMissing.length} 条`);
      for (const result of ogMissing) console.log(`  ${result.path} -> ${result.target.ogImageStatus}`);
      console.log("");
    }
  }

  if (crawl && crawl.broken.length > 0) process.exit(EXIT_DIFF);
  process.exit(blocking.length === 0 ? EXIT_OK : EXIT_DIFF);
}

function truncate(value, max) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

main().catch((error) => {
  console.error(`[seo-parity] unexpected error: ${error.stack ?? error.message}`);
  process.exit(EXIT_USAGE);
});
