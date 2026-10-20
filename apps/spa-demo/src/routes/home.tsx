import { useQuery } from "@tanstack/react-query";
import { ToolSlot } from "@/components/ToolSlot";
import { faq } from "@/lib/faq";
import { usePageHead } from "@/lib/head";
import { homePage } from "@/lib/pages";
import { toolFactsQuery } from "@/lib/query";
import { tool } from "@/lib/tool";

export function HomePage() {
  usePageHead(homePage);
  const facts = useQuery(toolFactsQuery);

  return (
    <>
      <h1>{tool.h1}</h1>
      <p className="lede">{tool.tagline}</p>

      {/* 首屏可用工具就是 Main Content；解释性文案一律排在工具之后。 */}
      <ToolSlot />

      <dl className="facts" aria-label="What this tool promises">
        {(facts.data ?? []).map((fact) => (
          <div className="facts__item" key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      <h2>How to {tool.h1.split(" — ")[0]}</h2>
      <ol className="steps">
        {tool.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <h2>FAQ</h2>
      <div className="faq">
        {faq.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </>
  );
}
