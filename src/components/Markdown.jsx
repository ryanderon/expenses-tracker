import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Markdown renderer for AI answers.
 *
 * Covers what models actually send back for a finance question — headings,
 * bold/italic, inline code, nested bullet and numbered lists, GitHub-style
 * tables, blockquotes, fenced code and rules — by building React elements
 * directly. No `dangerouslySetInnerHTML`, so model output can't inject markup.
 *
 * It is fed partial text while a reply streams, so every construct has to
 * render sensibly when cut off halfway (an unclosed fence, a table with only
 * its header row so far).
 */

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\s][^*\n]*\*|~~[^~\n]+~~)/g;

function renderInline(text, keyPrefix) {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      if (part.length > 4) {
        return <strong key={key} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      }
    }
    if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
      return <s key={key} className="text-muted-foreground">{part.slice(2, -2)}</s>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={key} className="rounded-md bg-secondary px-1.5 py-0.5 text-[0.88em] tabular-nums">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

// --- Tables ----------------------------------------------------------------

const TABLE_ROW = /^\|.*\|?$/;
const TABLE_SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim());
}

function parseAlign(separator) {
  return splitRow(separator).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

/** Money and percentages read better right-aligned even when the model forgot `--:`. */
const NUMERIC = /^[-+−]?\s*(rp\.?\s*)?[-+−]?[\d.,]+\s*(%|jt|rb|k|m|x|×)?$/i;

function columnIsNumeric(rows, col) {
  const cells = rows.map((r) => (r[col] || '').replace(/\*\*/g, '').trim()).filter(Boolean);
  return cells.length > 0 && cells.every((c) => NUMERIC.test(c));
}

// --- Block parser ------------------------------------------------------------

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function indentWidth(ws) {
  return ws.replace(/\t/g, '  ').length;
}

/** Turns a flat run of list lines into a nested tree by indentation. */
function buildList(items) {
  const root = { ordered: items[0].ordered, items: [], indent: items[0].indent };
  const stack = [root];

  for (const item of items) {
    while (stack.length > 1 && item.indent < stack[stack.length - 1].indent) stack.pop();
    let current = stack[stack.length - 1];
    const parentItem = current.items[current.items.length - 1];

    if (item.indent > current.indent && parentItem) {
      // Reuse an existing sublist so uneven indentation never drops items.
      parentItem.children ||= { ordered: item.ordered, items: [], indent: item.indent };
      stack.push(parentItem.children);
      current = parentItem.children;
    }
    current.items.push({ text: item.text, children: null });
  }
  return root;
}

function parse(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code — renders even if the closing fence hasn't streamed in yet.
    if (trimmed.startsWith('```')) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', text: body.join('\n'), key: blocks.length });
      continue;
    }

    if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      blocks.push({ type: 'hr', key: blocks.length });
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: Math.min(heading[1].length, 4),
        text: heading[2].replace(/\s*#+$/, ''),
        key: blocks.length,
      });
      i += 1;
      continue;
    }

    // Table: a pipe row followed by a separator row. A lone header row while
    // the separator is still streaming falls through to a paragraph for a beat.
    if (TABLE_ROW.test(trimmed) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1].trim())) {
      const header = splitRow(trimmed);
      const align = parseAlign(lines[i + 1].trim());
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', header, align, rows, key: blocks.length });
      continue;
    }

    if (trimmed.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        body.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', children: parse(body.join('\n')), key: blocks.length });
      continue;
    }

    if (LIST_ITEM.test(raw)) {
      const items = [];
      while (i < lines.length) {
        const line = lines[i];
        const match = LIST_ITEM.exec(line);
        if (match) {
          items.push({
            indent: indentWidth(match[1]),
            ordered: /\d/.test(match[2]),
            text: match[3],
          });
          i += 1;
          continue;
        }
        // An indented, non-blank line continues the previous item's text.
        if (line.trim() && /^\s+/.test(line) && items.length) {
          items[items.length - 1].text += ` ${line.trim()}`;
          i += 1;
          continue;
        }
        // A blank line between items keeps the list going; anything else ends it.
        if (!line.trim() && i + 1 < lines.length && LIST_ITEM.test(lines[i + 1])) {
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: 'list', list: buildList(items), key: blocks.length });
      continue;
    }

    // Paragraph: soft-wrapped lines join until a blank line or another block.
    const para = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next
        || next.startsWith('#')
        || next.startsWith('```')
        || next.startsWith('>')
        || next.startsWith('|')
        || LIST_ITEM.test(lines[i])
        || /^(---|\*\*\*|___)$/.test(next)
      ) break;
      para.push(next);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: para.join(' '), key: blocks.length });
  }

  return blocks;
}

// --- Rendering ---------------------------------------------------------------

const HEADING_CLASS = {
  1: 'text-[16px] font-extrabold mt-6',
  2: 'text-[15px] font-bold mt-6',
  3: 'text-[14px] font-bold mt-5',
  4: 'text-[12px] font-bold uppercase tracking-wider text-muted-foreground mt-5',
};

function List({ list, keyPrefix, depth = 0 }) {
  const Tag = list.ordered ? 'ol' : 'ul';
  return (
    <Tag
      className={cn(
        'flex flex-col gap-1.5 pl-5',
        depth === 0 ? 'my-3' : 'mt-1.5',
        list.ordered ? 'list-decimal' : depth === 0 ? 'list-disc' : 'list-[circle]'
      )}
    >
      {list.items.map((item, i) => (
        <li key={`${keyPrefix}-${i}`} className="pl-0.5 marker:text-muted-foreground">
          {renderInline(item.text, `${keyPrefix}-${i}`)}
          {item.children && (
            <List list={item.children} keyPrefix={`${keyPrefix}-${i}c`} depth={depth + 1} />
          )}
        </li>
      ))}
    </Tag>
  );
}

// Ways to lay a table out, roomiest first. A four-column comparison (label,
// this period, last period, difference) is wider than a phone; rather than
// hide the last columns off the edge, the table steps down until it fits:
// "stacked" gives each row's label a line of its own so the values get the
// full width, and "cards" lists every value under its column name.
const TABLE_LAYOUTS = ['plain', 'stacked', 'cards'];

function Table({ block }) {
  const cols = Math.max(block.header.length, ...block.rows.map((r) => r.length));
  const align = Array.from({ length: cols }, (_, c) => {
    const declared = block.align[c] || 'left';
    if (declared !== 'left' || c === 0) return declared;
    return columnIsNumeric(block.rows, c) ? 'right' : 'left';
  });
  const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' };

  const wrapRef = useRef(null);
  const tableRef = useRef(null);
  // Width each layout needed when last shown, and the width last available.
  const needed = useRef({});
  const lastRoom = useRef(0);
  const [layout, setLayout] = useState('plain');
  const canStep = cols > 2;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !canStep) return undefined;
    // The observer reports once straight away, before the first paint.
    const observer = new ResizeObserver(() => {
      const room = wrap.clientWidth;
      const grew = room > lastRoom.current;
      lastRoom.current = room;
      needed.current[layout] = tableRef.current?.scrollWidth || 0;
      const at = TABLE_LAYOUTS.indexOf(layout);
      if (needed.current[layout] > room + 1) {
        if (at < TABLE_LAYOUTS.length - 1) setLayout(TABLE_LAYOUTS[at + 1]);
        return;
      }
      // Step back up only when the screen got wider (a turned phone), not
      // while a streaming reply is still adding rows.
      if (!grew) return;
      const roomier = TABLE_LAYOUTS.slice(0, at).find((l) => needed.current[l] && needed.current[l] <= room);
      if (roomier) setLayout(roomier);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [layout, canStep, block]);

  const cell = (r, c) => renderInline(block.rows[r][c] || '', `${block.key}-${r}-${c}`);
  const head = (c) => renderInline(block.header[c] || '', `${block.key}-h${c}`);
  const valueCols = Array.from({ length: cols - 1 }, (_, i) => i + 1);
  const labelRow = (r, span) => (
    <tr className="border-t border-border">
      <td colSpan={span} className="px-3 pb-0.5 pt-2.5 font-semibold text-foreground">{cell(r, 0)}</td>
    </tr>
  );

  let content;
  if (layout === 'cards') {
    content = (
      <tbody>
        {block.rows.map((row, r) => (
          <Fragment key={r}>
            {labelRow(r, 2)}
            {valueCols.map((c, i) => (
              <tr key={c}>
                <td className={cn('px-3 text-[12px] text-muted-foreground', i === valueCols.length - 1 ? 'pb-2.5' : 'pb-1')}>
                  {head(c)}
                </td>
                <td className={cn('whitespace-nowrap px-3 text-right', i === valueCols.length - 1 ? 'pb-2.5' : 'pb-1')}>
                  {cell(r, c)}
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    );
  } else {
    const stacked = layout === 'stacked';
    const shown = stacked ? valueCols : [0, ...valueCols];
    const pad = stacked ? 'px-2' : 'px-3';
    content = (
      <>
        <thead className="bg-secondary/60">
          <tr>
            {shown.map((c) => (
              <th
                key={c}
                className={cn(
                  'whitespace-nowrap py-2 text-[11.5px] font-bold text-muted-foreground',
                  pad, alignClass[stacked ? 'right' : align[c]]
                )}
              >
                {head(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <Fragment key={r}>
              {stacked && labelRow(r, shown.length)}
              <tr className={stacked ? undefined : 'border-t border-border'}>
                {shown.map((c) => (
                  <td
                    key={c}
                    className={cn(
                      'align-top',
                      stacked ? 'pb-2.5 pt-0.5' : 'py-2',
                      pad,
                      c === 0 && 'font-medium text-foreground',
                      (stacked || align[c] === 'right') && 'whitespace-nowrap',
                      alignClass[stacked ? 'right' : align[c]]
                    )}
                  >
                    {cell(r, c)}
                  </td>
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </>
    );
  }

  return (
    // Sideways scrolling stays as the last resort, for a cell too wide even as a card.
    <div ref={wrapRef} className="my-4 overflow-x-auto rounded-xl border border-border">
      <table
        ref={tableRef}
        data-layout={layout}
        className={cn('w-full border-collapse tabular-nums', layout === 'plain' ? 'text-[13px]' : 'text-[12.5px]')}
      >
        {content}
      </table>
    </div>
  );
}

function Blocks({ blocks }) {
  return blocks.map((block) => {
    switch (block.type) {
      case 'hr':
        return <hr key={block.key} className="my-5 border-border" />;
      case 'heading': {
        const Tag = `h${Math.min(block.level + 1, 6)}`;
        return (
          <Tag key={block.key} className={cn('text-foreground first:mt-0', HEADING_CLASS[block.level])}>
            {renderInline(block.text, block.key)}
          </Tag>
        );
      }
      case 'list':
        return <List key={block.key} list={block.list} keyPrefix={String(block.key)} />;
      case 'table':
        return <Table key={block.key} block={block} />;
      case 'quote':
        return (
          <div
            key={block.key}
            className="my-3 rounded-xl border-l-[3px] border-primary bg-[var(--primary-soft)] px-3.5 py-2.5"
          >
            <Blocks blocks={block.children} />
          </div>
        );
      case 'code':
        return (
          <pre
            key={block.key}
            className="my-3 overflow-x-auto rounded-xl bg-secondary px-3.5 py-3 text-[12.5px] leading-relaxed"
          >
            <code>{block.text}</code>
          </pre>
        );
      default:
        return (
          <p key={block.key} className="my-3 first:mt-0 last:mb-0">
            {renderInline(block.text, block.key)}
          </p>
        );
    }
  });
}

export default function Markdown({ content, className }) {
  const blocks = useMemo(() => parse(content || ''), [content]);

  return (
    <div
      className={cn(
        'text-[14.5px] leading-[1.7] text-foreground/90 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className
      )}
    >
      <Blocks blocks={blocks} />
    </div>
  );
}
