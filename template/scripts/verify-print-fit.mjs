#!/usr/bin/env node
/**
 * 打印实测 harness（BING-89 B2 自 printable-studio 回灌；机制，不含站点目标）：
 * 每个被测页面在 A4 与 US Letter 下各真实打印一次，断言两件事：
 *   1. 页数正好等于预期 —— 多一页就说明某个 sheet 溢出截断了；
 *   2. 每页 MediaBox 与纸张一致 —— @page size 真的生效。
 *
 * 单页截断恰恰高发在极端合法配置（大网格、长词、最大题量），所以新站接入
 * 打印层时，除默认档外**必须**补一组 worst-case target（参考 printable-studio
 * 的 `bingo-worst-7x7` / `math-worst-50-problems` / `crossword-worst-25-words`）。
 *
 * 用法：往 TARGETS 里加条目 ——
 *   { name, path, paperSelect, expectedPages }
 *   可选 drive(cdp, sessionId)  走页面真实控件注入配置（React 受控输入用原生
 *                               setter + input 事件，见 SET_VALUE）；
 *   可选 verify(cdp, sessionId) 打印前断言 DOM 真的进入目标状态（防驱动失败假绿）。
 *
 * 流程：本地静态伺服构建产物 → headless Chrome（CDP）打开页面 → 按需驱动控件 /
 * 切换 Paper 下拉 → Page.printToPDF(preferCSSPageSize) → 解析 PDF 页数与页面尺寸。
 *
 * 需要本机 Chrome（macOS 默认路径，或 --chrome 传入）。这是本地验证命令，
 * 不进 CI：runner 上没有稳定的 Chrome 路径。
 *
 *   npm run build && node scripts/verify-print-fit.mjs [--chrome <path>] [--keep]
 *   --keep  把 PDF 留在 .print-fit/ 供人工检查（默认跑完即删）。
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { appRoot, distDir } from "./lib/paths.mjs";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

const args = process.argv.slice(2);
function argValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const keepPdfs = args.includes("--keep");
const chromePath = argValue("--chrome") ?? CHROME_CANDIDATES.find((candidate) => {
  try {
    readFileSync(candidate);
    return true;
  } catch {
    return false;
  }
});

if (!chromePath) {
  console.error("no Chrome found — pass --chrome /path/to/chrome");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".woff2": "font/woff2",
};

/** 静态伺服构建产物（printToPDF 需要真实 URL，不能 file:// 混淆资源路径）。 */
function serveStatic(root) {
  return new Promise((resolve) => {
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        const requested = join(root, decodeURIComponent(url.pathname));
        // Workers Static Assets 语义：/path -> /path/index.html（无尾斜杠同样命中）。
        const candidates = url.pathname.endsWith("/")
          ? [join(requested, "index.html")]
          : [requested, join(requested, "index.html")];
        for (const filePath of candidates) {
          try {
            const body = await readFile(filePath);
            response.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
            response.end(body);
            return;
          } catch {
            // 试下一个
          }
        }
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
      } catch {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/**
 * Chrome 的 ProcessSingleton 是 UNIX domain socket：user-data-dir 路径超过
 * ~104 字符时，Chrome 要在临时目录里建一个「缩短路径」的 socket 目录，建不出
 * 就直接退出（exit 21，"Failed to create socket directory"）。所以 profile
 * 必须放在「短且可写」的目录：优先 $TMPDIR，再退 /tmp，最后才是站点根
 * （站点根本身往往因为整条路径太长而不可用，只当兜底）。
 */
function createProfileDir() {
  for (const base of [tmpdir(), "/tmp", appRoot]) {
    try {
      return mkdtempSync(join(base, "print-fit-profile-"));
    } catch {
      // 试下一个
    }
  }
  throw new Error("no writable short dir for the Chrome profile");
}

/**
 * 启 headless Chrome，拿 CDP 的 browser WebSocket 地址。
 */
function launchChrome() {
  return new Promise((resolve, reject) => {
    const profile = createProfileDir();
    const child = spawn(
      chromePath,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "--disable-crashpad",
        "about:blank",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`chrome did not expose a DevTools endpoint\n${buffer.slice(-800)}`)), 15000);
    child.stderr.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve({ child, profile, browserWs: match[1] });
      }
    });
    child.on("exit", (code) =>
      reject(new Error(`chrome exited (code ${code}) before exposing the DevTools endpoint\n${buffer.slice(-800)}`)),
    );
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else resolve(message.result);
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  async waitForEvent(method, sessionId, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const index = this.events.findIndex(
        (event) => event.method === method && (sessionId === undefined || event.sessionId === sessionId),
      );
      if (index >= 0) return this.events.splice(index, 1)[0];
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`timed out waiting for ${method}`);
  }
}

function drainEvents(cdp) {
  cdp.events.length = 0;
}

const PAPER_DIMENSIONS = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
};

function parsePdf(pdf) {
  const text = pdf.toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const mediaBox = /MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
  const width = mediaBox ? Number(mediaBox[3]) - Number(mediaBox[1]) : 0;
  const height = mediaBox ? Number(mediaBox[4]) - Number(mediaBox[2]) : 0;
  return { pages, width, height };
}

/** React 受控输入必须走原生 setter + input/change 事件，直接赋值不触发 onChange。 */
const SET_VALUE = `const setValue = (element, value) => {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
  );
}`;

/** 断言表达式的求值结果是 null（= 通过），否则把失败原因抛给目标循环。 */
async function assertDom(cdp, sessionId, expression) {
  const { result } = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true },
    sessionId,
  );
  if (result.type === "string") return String(result.value);
  if (result.type === "object" && result.subtype === "error") return `evaluate failed: ${result.description}`;
  return null;
}

/**
 * 被测目标：模板不带打印目标（ToolSlot 是占位工具）。站点长出打印输出时，
 * 在这里加 target（默认档 + worst-case 档，写法见文件头）。
 */
const TARGETS = [];

// mkdirSync(recursive) 在目录已存在时返回 undefined —— 输出路径用 join 先算好。
const outDir = keepPdfs ? join(appRoot, ".print-fit") : mkdtempSync(join(tmpdir(), "print-fit-out-"));
if (keepPdfs) mkdirSync(outDir, { recursive: true });
let failures = 0;

/** `npm run build` 的产物可能在 dist/web（旧入口）或 cf Build Output（vite 插件）。 */
async function resolveSiteRoot() {
  for (const candidate of [distDir, join(appRoot, ".cloudflare/output/v0/workers/default/assets")]) {
    try {
      await stat(join(candidate, "index.html"));
      return candidate;
    } catch {
      // 试下一个
    }
  }
  console.error("no built site found — run `npm run build` first");
  process.exit(1);
}

if (TARGETS.length === 0) {
  console.log(
    "print fit verification: no targets configured — add them as the site grows\n" +
      "(default-config target first, then worst-case groups; see the file header)",
  );
  process.exit(0);
}

const server = await serveStatic(await resolveSiteRoot());
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
const { child, profile, browserWs } = await launchChrome();
const socket = new WebSocket(browserWs);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", () => reject(new Error("failed to connect to the DevTools socket")), { once: true });
});
const cdp = new Cdp(socket);

try {
  for (const target of TARGETS) {
    for (const paper of ["A4", "Letter"]) {
      const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
      drainEvents(cdp);
      await cdp.send("Page.enable", {}, sessionId);
      // 每个 target 注入一次：固定种子的 mulberry32 顶掉 Math.random，
      // 「Generate」按钮抽的 seed 从此可复现，页数断言跨运行稳定。
      await cdp.send(
        "Page.addScriptToEvaluateOnNewDocument",
        {
          source: `(() => {
            let state = 0x5eed;
            Math.random = () => {
              state = (state + 0x6d2b79f5) | 0;
              let t = state;
              t = Math.imul(t ^ (t >>> 15), t | 1);
              t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
              return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
          })()`,
        },
        sessionId,
      );
      await cdp.send("Page.navigate", { url: `${base}${target.path}` }, sessionId);
      await cdp.waitForEvent("Page.loadEventFired", sessionId);
      // 等 hydration：打印文档由 React 渲染，切 Paper 要在状态接管之后。
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // worst-case 组：先注入配置，等 React 重建打印文档，再确认真的进入极端状态。
      let driveProblem = null;
      if (target.drive) {
        const { result } = await target.drive(cdp, sessionId);
        if (result?.type === "string" && result.value !== "ok") {
          driveProblem = `drive failed: ${result.value}`;
        } else if (result?.type === "object" && result.subtype === "error") {
          driveProblem = `drive threw: ${result.description}`;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 800));
          driveProblem = target.verify ? await target.verify(cdp, sessionId) : null;
        }
      }

      if (paper === "Letter") {
        await cdp.send(
          "Runtime.evaluate",
          {
            expression: `(() => {
              const select = document.querySelector(${JSON.stringify(target.paperSelect)});
              if (!select) return "missing";
              select.value = "Letter";
              select.dispatchEvent(new Event("change", { bubbles: true }));
              return "ok";
            })()`,
            returnByValue: true,
          },
          sessionId,
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // 本地验证不需要流式：直接拿 base64。
      const { data } = await cdp.send(
        "Page.printToPDF",
        { preferCSSPageSize: true, printBackground: true },
        sessionId,
      );
      const pdf = Buffer.from(data ?? "", "base64");

      const file = join(outDir, `${target.name.split(" ")[0]}-${paper}.pdf`.replace(/[^a-z0-9.-]/gi, "-").toLowerCase());
      writeFileSync(file, pdf);
      const { pages, width, height } = parsePdf(pdf);
      const dims = PAPER_DIMENSIONS[paper];
      const sizeOk = Math.abs(width - dims.width) < 1.5 && Math.abs(height - dims.height) < 1.5;
      const pagesOk = pages === target.expectedPages;
      const ok = sizeOk && pagesOk && driveProblem === null;
      if (!ok) failures += 1;
      let line =
        `${ok ? "  PASS" : "  FAIL"}  ${target.name} · ${paper}: ${pages} page(s)` +
        ` (expected ${target.expectedPages}), MediaBox ${width.toFixed(0)}×${height.toFixed(0)}pt` +
        ` (expected ${dims.width}×${dims.height})`;
      if (driveProblem) line += `\n        ${driveProblem}`;
      console.log(line);

      await cdp.send("Target.closeTarget", { targetId });
    }
  }
} finally {
  server.close();
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 800));
  child.kill("SIGKILL");
  const cleanup = { recursive: true, force: true, maxRetries: 10, retryDelay: 250 };
  if (!keepPdfs) rmSync(outDir, cleanup);
  else console.log(`\nPDFs kept in ${outDir}`);
  rmSync(profile, cleanup);
}

console.log(`\nprint fit verification: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
