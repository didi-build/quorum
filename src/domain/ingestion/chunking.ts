import { getEncoding } from "js-tiktoken";
import type { QuorumConfig } from "../../config/types.js";

export interface DocumentChunk {
  document_id: string;
  chunk_index: number;
  content: string;
  heading_hierarchy: string[];
}

let encoder: ReturnType<typeof getEncoding> | null = null;

function getEncoder(): ReturnType<typeof getEncoding> {
  if (!encoder) {
    encoder = getEncoding("cl100k_base");
  }
  return encoder;
}

function countTokens(text: string, enc: ReturnType<typeof getEncoding>): number {
  return enc.encode(text).length;
}

function splitSections(text: string): Array<{ text: string; heading: string[] }> {
  const sections: Array<{ text: string; heading: string[] }> = [];
  let currentHeading: string[] = [];
  let currentLines: string[] = [];

  for (const line of text.split("\n")) {
    if (line.startsWith("#")) {
      if (currentLines.length > 0) {
        sections.push({
          text: currentLines.join("\n").trim(),
          heading: [...currentHeading],
        });
        currentLines = [];
      }
      const hashPrefix = line.match(/^#+/);
      const level = hashPrefix ? hashPrefix[0].length : 0;
      const heading = line.replace(/^#+\s*/, "").trim();
      currentHeading = currentHeading.slice(0, Math.max(level - 1, 0)).concat(heading);
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      text: currentLines.join("\n").trim(),
      heading: [...currentHeading],
    });
  }

  if (sections.length === 0 && text.trim()) {
    sections.push({ text: text.trim(), heading: [] });
  }

  return sections;
}

export function chunkText(
  documentId: string,
  text: string,
  config: Pick<QuorumConfig, "chunkTargetTokens" | "chunkOverlapTokens">,
): DocumentChunk[] {
  const enc = getEncoder();
  const target = config.chunkTargetTokens;
  const overlap = config.chunkOverlapTokens;

  const sections = splitSections(text);
  if (sections.length === 0) {
    return [];
  }

  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;
  let buffer = "";
  let bufferHeading: string[] = [];

  const flushBuffer = (): void => {
    const content = buffer.trim();
    if (!content) {
      return;
    }
    chunks.push({
      document_id: documentId,
      chunk_index: chunkIndex,
      content,
      heading_hierarchy: [...bufferHeading],
    });
    chunkIndex += 1;
    if (overlap > 0) {
      const tokens = enc.encode(content);
      const overlapTokens = tokens.length > overlap ? tokens.slice(-overlap) : tokens;
      buffer = enc.decode(overlapTokens);
    } else {
      buffer = "";
      bufferHeading = [];
    }
  };

  for (const section of sections) {
    const paragraphs = section.text
      .split("\n\n")
      .map((part) => part.trim())
      .filter(Boolean);
    const sectionParagraphs =
      paragraphs.length > 0 ? paragraphs : section.text ? [section.text] : [];

    for (const paragraph of sectionParagraphs) {
      const candidate = buffer ? `${buffer}\n\n${paragraph}`.trim() : paragraph;
      if (countTokens(candidate, enc) <= target) {
        buffer = candidate;
        bufferHeading = section.heading;
      } else {
        flushBuffer();
        buffer = paragraph;
        bufferHeading = section.heading;
        while (countTokens(buffer, enc) > target) {
          const tokens = enc.encode(buffer);
          const piece = enc.decode(tokens.slice(0, target));
          chunks.push({
            document_id: documentId,
            chunk_index: chunkIndex,
            content: piece,
            heading_hierarchy: [...bufferHeading],
          });
          chunkIndex += 1;
          buffer =
            overlap > 0 ? enc.decode(tokens.slice(target - overlap, target)) : "";
        }
      }
    }
  }

  flushBuffer();
  return chunks;
}
