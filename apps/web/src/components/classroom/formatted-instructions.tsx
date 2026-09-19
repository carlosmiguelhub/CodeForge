import { Fragment, type ReactNode } from "react";

// A deliberately tiny, fixed markup — not full Markdown — so it can be
// rendered by hand-building React nodes (never dangerouslySetInnerHTML)
// with zero XSS surface, regardless of what a teacher types. Supported:
// **bold**, __underline__, and lines starting with "- " (or "* ") grouped
// into a bullet list. Anything else renders as plain text, so instructions
// written before this existed still look exactly the same.
const INLINE_PATTERN = /\*\*(.+?)\*\*|__(.+?)__/g;

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${key++}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<u key={`${keyPrefix}-${key++}`}>{match[2]}</u>);
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const BULLET_PATTERN = /^[-*]\s+(.*)$/;

// Renders instructions/problem text authored with InstructionsEditor's
// markup. Used everywhere that text is shown back — teacher preview,
// student workspace — so formatting a teacher applies is actually visible
// to students, not just stored as inert asterisks.
export function FormattedInstructions({
  text,
  className,
}: Readonly<{ text: string; className?: string }>) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let paraBuffer: string[] = [];
  let blockKey = 0;

  function flushList() {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    blocks.push(
      <ul key={`list-${blockKey++}`} className="list-disc space-y-1 pl-5">
        {items.map((item, index) => (
          <li key={index}>{parseInline(item, `li-${blockKey}-${index}`)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  function flushPara() {
    if (paraBuffer.length === 0) return;
    const paraLines = paraBuffer;
    blocks.push(
      <p key={`p-${blockKey++}`}>
        {paraLines.map((line, index) => (
          <Fragment key={index}>
            {index > 0 ? <br /> : null}
            {parseInline(line, `p-${blockKey}-${index}`)}
          </Fragment>
        ))}
      </p>,
    );
    paraBuffer = [];
  }

  for (const line of lines) {
    const bulletMatch = BULLET_PATTERN.exec(line);
    if (bulletMatch) {
      flushPara();
      listBuffer.push(bulletMatch[1] ?? "");
    } else {
      flushList();
      paraBuffer.push(line);
    }
  }
  flushList();
  flushPara();

  return <div className={className}>{blocks}</div>;
}
