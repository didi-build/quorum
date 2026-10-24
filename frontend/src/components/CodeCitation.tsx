import { useState } from "react";
import type { Citation } from "../types/chat";

interface CodeCitationProps {
  citation: Citation;
  defaultOpen?: boolean;
}

function splitExcerptLines(excerpt: string): string[] {
  return excerpt.replace(/\r\n/g, "\n").split("\n");
}

function displayPath(documentId: string): string {
  const prefix = "didi-build/";
  return documentId.startsWith(prefix) ? documentId.slice(prefix.length) : documentId;
}

export function CodeCitation({ citation, defaultOpen = false }: CodeCitationProps) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = splitExcerptLines(citation.excerpt);
  const startLine = citation.chunk_index + 1;
  const endLine = startLine + Math.max(lines.length - 1, 0);
  const path = displayPath(citation.document_id);

  return (
    <div className="quorum-cite">
      <button
        type="button"
        className="quorum-cite-h"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span className="path">{path}</span>
        <span>
          L{startLine}:{endLine}
        </span>
      </button>
      {open ? (
        <pre>
          {lines.map((line, index) => (
            <div
              key={`${citation.document_id}-${index}`}
              className={index === 0 ? "hit" : undefined}
            >
              <span className="ln">{startLine + index}</span>
              <span>{line || " "}</span>
            </div>
          ))}
        </pre>
      ) : null}
    </div>
  );
}
