import type { FaqItem } from "@/shared/seo";

/** 3–5 条，覆盖真实长尾疑问；同一数组既渲染可见 FAQ，也喂 FAQPage schema。 */
export const faq: FaqItem[] = [
  {
    question: "Is this really free?",
    answer: "Yes — the tool is free, has no watermark and needs no account.",
  },
  {
    question: "Are my files uploaded to a server?",
    answer:
      "No. The file is processed entirely in your browser; no file bytes are sent anywhere.",
  },
  {
    question: "Does the download keep the original metadata?",
    answer:
      "No. The export is re-encoded from scratch, so EXIF and other metadata are removed.",
  },
];
