import {
  absoluteUrl,
  buildPageMetadata,
  faqPageJsonLd,
  jsonLdGraph,
  webApplicationJsonLd,
} from "@microtools/seo-kit";
import { faq } from "@/lib/faq";
import { site } from "@/lib/site";
import { tool } from "@/lib/tool";
import { JsonLd } from "@/components/JsonLd";
import { ToolSlot } from "@/components/ToolSlot";

export const metadata = buildPageMetadata(site, {
  path: tool.path,
  title: tool.title,
  description: tool.description,
  live: tool.live,
});

export default function HomePage() {
  const url = absoluteUrl(site, tool.path);
  const graph = jsonLdGraph([
    webApplicationJsonLd({
      name: tool.title,
      description: tool.description,
      url,
      featureList: ["Runs entirely in the browser", "No watermark", "No sign-up"],
    }),
    faqPageJsonLd(faq),
  ]);

  return (
    <>
      <JsonLd data={graph} />
      <h1>{tool.h1}</h1>
      <p className="lede">{tool.tagline}</p>

      {/* 首屏可用工具就是 Main Content：任何解释性文案都必须在工具之后。 */}
      <ToolSlot />

      <h2>How to {tool.h1.split(" — ")[0]}</h2>
      <ol className="steps">
        {tool.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <h2>FAQ</h2>
      {faq.map((item) => (
        <details key={item.question}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </>
  );
}
