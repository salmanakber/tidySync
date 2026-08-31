"use client";

import { useMemo, type ReactNode } from "react";

type BriefingBlock =
  | { type: "verdict"; score: number | null; title: string; body: string }
  | { type: "heading"; text: string; tone: "strengths" | "fixes" | "quickwin" | "default" }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "hr" };

function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^#+\s*/, "")
    .trim();
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    if (m[1] != null) {
      parts.push(
        <strong key={key++} className="tidysync-briefing-strong">
          {m[1]}
        </strong>,
      );
    } else if (m[2] != null) {
      parts.push(<em key={key++}>{m[2]}</em>);
    } else if (m[3] != null) {
      parts.push(
        <code key={key++} className="tidysync-briefing-code">
          {m[3]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function headingTone(text: string): "strengths" | "fixes" | "quickwin" | "default" {
  const t = text.toLowerCase();
  if (t.includes("strength")) return "strengths";
  if (t.includes("fix") || t.includes("priorit")) return "fixes";
  if (t.includes("quick")) return "quickwin";
  return "default";
}

function extractScore(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*[\/⁄]\s*100/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
}

function isVerdictLine(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("overall verdict") || t.includes("verdict");
}

export function parseAiBriefing(raw: string): BriefingBlock[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: BriefingBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    i += 1;

    if (!line) continue;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      blocks.push({ type: "hr" });
      continue;
    }

    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      const text = stripMd(headingMatch[1]);
      blocks.push({ type: "heading", text, tone: headingTone(text) });
      continue;
    }

    // Bold-only line used as section title: **Top 3 Strengths**
    const boldOnly = line.match(/^\*\*(.+?)\*\*$/);
    if (boldOnly && !line.includes("–") && !line.includes("-") && boldOnly[1].length < 80) {
      const text = boldOnly[1].trim();
      if (isVerdictLine(text)) {
        // fall through — handled below with body
      } else {
        blocks.push({ type: "heading", text, tone: headingTone(text) });
        continue;
      }
    }

    // Verdict line: **Overall Verdict – 77 / 100**
    if (isVerdictLine(stripMd(line))) {
      const score = extractScore(line);
      const title = stripMd(line).replace(/\s*[–—-]\s*\d{1,3}\s*[\/⁄]\s*100/, "").trim() || "Overall verdict";
      const bodyParts: string[] = [];
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) {
          if (bodyParts.length) break;
          i += 1;
          continue;
        }
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(next) || /^#{1,3}\s+/.test(next) || /^\*\*[^*]+\*\*$/.test(next)) {
          break;
        }
        if (/^(\d+\.|[-*•])\s+/.test(next)) break;
        bodyParts.push(next);
        i += 1;
      }
      blocks.push({
        type: "verdict",
        score,
        title,
        body: bodyParts.join(" ").replace(/\*\*/g, ""),
      });
      continue;
    }

    if (/^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items: string[] = [line.replace(/^([-*•]|\d+\.)\s+/, "")];
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) break;
        if (ordered ? /^\d+\.\s+/.test(next) : /^[-*•]\s+/.test(next)) {
          items.push(next.replace(/^([-*•]|\d+\.)\s+/, ""));
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
  }

  return blocks;
}

function scoreTone(score: number): "great" | "good" | "warn" | "poor" {
  if (score >= 85) return "great";
  if (score >= 70) return "good";
  if (score >= 50) return "warn";
  return "poor";
}

interface AiBriefingViewProps {
  text: string;
}

export function AiBriefingView({ text }: AiBriefingViewProps) {
  const blocks = useMemo(() => parseAiBriefing(text), [text]);

  if (!text.trim()) return null;

  return (
    <div className="tidysync-briefing">
      {blocks.map((block, idx) => {
        if (block.type === "verdict") {
          const tone = block.score != null ? scoreTone(block.score) : "good";
          return (
            <div key={idx} className={`tidysync-briefing-verdict is-${tone}`}>
              {block.score != null && (
                <div className="tidysync-briefing-score" aria-label={`Score ${block.score} out of 100`}>
                  <span className="tidysync-briefing-score-value">{block.score}</span>
                  <span className="tidysync-briefing-score-max">/100</span>
                </div>
              )}
              <div className="tidysync-briefing-verdict-copy">
                <p className="tidysync-briefing-verdict-title">{block.title}</p>
                {block.body ? <p className="tidysync-briefing-verdict-body">{block.body}</p> : null}
              </div>
            </div>
          );
        }

        if (block.type === "heading") {
          return (
            <h4 key={idx} className={`tidysync-briefing-heading is-${block.tone}`}>
              {block.text}
            </h4>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={idx}
              className={`tidysync-briefing-list${block.ordered ? " is-ordered" : " is-bullets"}`}
            >
              {block.items.map((item, j) => (
                <li key={j}>
                  <span className="tidysync-briefing-list-marker" aria-hidden>
                    {block.ordered ? String(j + 1) : "•"}
                  </span>
                  <span className="tidysync-briefing-list-text">{renderInline(item)}</span>
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "hr") {
          return <hr key={idx} className="tidysync-briefing-hr" />;
        }

        return (
          <p key={idx} className="tidysync-briefing-p">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
