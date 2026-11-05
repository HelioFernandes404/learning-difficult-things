"use client";

import { useEffect, useId, useState } from "react";
import { useT } from "@/i18n/client";

/** Renders a Mermaid diagram on the client. On error, shows the raw code. */
export function Mermaid({ code }: { code: string }) {
  const t = useT();
  const id = "mmd" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [dark0, setDark] = useState(false);

  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains("dark"));
    read();
    window.addEventListener("themechange", read);
    return () => window.removeEventListener("themechange", read);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // small debounce: the code arrives piecemeal while streaming
    const t = setTimeout(async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = dark0;
        const v = dark
          ? { bg: "#30302e", line: "#a3a199", text: "#f5f4ee", border: "#3d3d3a", alt: "#3a3a37" }
          : { bg: "#f0eee6", line: "#6b6a65", text: "#1f1e1d", border: "#d8d4c7", alt: "#faf9f5" };
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          themeVariables: {
            darkMode: dark,
            background: "transparent",
            primaryColor: v.bg,
            primaryTextColor: v.text,
            primaryBorderColor: "#d97757",
            secondaryColor: v.alt,
            tertiaryColor: v.alt,
            lineColor: v.line,
            textColor: v.text,
            mainBkg: v.bg,
            nodeBorder: "#d97757",
            clusterBkg: v.alt,
            clusterBorder: v.border,
            edgeLabelBackground: v.alt,
            noteBkgColor: v.alt,
            noteTextColor: v.text,
            noteBorderColor: v.border,
            actorBkg: v.bg,
            actorBorder: "#d97757",
            actorTextColor: v.text,
            signalColor: v.line,
            signalTextColor: v.text,
          },
        });
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(svg);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
        document.getElementById("d" + id)?.remove();
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, id, dark0]);

  if (failed || svg === null) {
    return (
      <pre className="text-xs" title={failed ? t.chat.diagramInvalid : t.chat.diagramRendering}>
        <code>{code}</code>
      </pre>
    );
  }
  return <div className="my-4 flex justify-center overflow-x-auto rounded-xl border bg-surface p-4" dangerouslySetInnerHTML={{ __html: svg }} />;
}
