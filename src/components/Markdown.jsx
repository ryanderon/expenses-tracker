import { Fragment, useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * Minimal markdown renderer for Claude's responses.
 *
 * Covers the subset the system prompt asks for — headings, bold, inline code,
 * bullets, numbered lists, rules — by building React elements directly. No
 * `dangerouslySetInnerHTML`, so model output can't inject markup.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;

function renderInline(text, keyPrefix) {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em] tabular-nums">
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

function parse(source) {
  const lines = source.split('\n');
  const blocks = [];
  let list = null;

  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      flushList();
      blocks.push({ type: 'hr', key: i });
      return;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2], key: i });
      return;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      if (!list || list.ordered) {
        flushList();
        list = { type: 'list', ordered: false, items: [], key: i };
      }
      list.items.push(bullet[1]);
      return;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      if (!list || !list.ordered) {
        flushList();
        list = { type: 'list', ordered: true, items: [], key: i };
      }
      list.items.push(numbered[1]);
      return;
    }

    // Plain text continues the previous paragraph rather than starting a new
    // one, so a soft-wrapped sentence doesn't render as two blocks.
    const last = blocks[blocks.length - 1];
    if (!list && last?.type === 'paragraph') {
      last.text += ` ${trimmed}`;
      return;
    }
    flushList();
    blocks.push({ type: 'paragraph', text: trimmed, key: i });
  });

  flushList();
  return blocks;
}

const HEADING_CLASS = {
  1: 'text-base font-bold mt-5 first:mt-0',
  2: 'text-sm font-bold mt-5 first:mt-0',
  3: 'text-sm font-semibold mt-4 first:mt-0',
  4: 'text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4 first:mt-0',
};

export default function Markdown({ content, className }) {
  const blocks = useMemo(() => parse(content || ''), [content]);

  return (
    <div className={cn('text-sm leading-relaxed text-muted-foreground', className)}>
      {blocks.map((block) => {
        if (block.type === 'hr') {
          return <hr key={block.key} className="my-4 border-border" />;
        }
        if (block.type === 'heading') {
          const Tag = `h${Math.min(block.level + 1, 6)}`;
          return (
            <Tag key={block.key} className={cn('text-foreground', HEADING_CLASS[block.level])}>
              {renderInline(block.text, block.key)}
            </Tag>
          );
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={block.key}
              className={cn(
                'my-2 flex flex-col gap-1.5 pl-5',
                block.ordered ? 'list-decimal' : 'list-disc'
              )}
            >
              {block.items.map((item, i) => (
                <li key={`${block.key}-${i}`} className="marker:text-muted-foreground/60">
                  {renderInline(item, `${block.key}-${i}`)}
                </li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={block.key} className="my-2 first:mt-0 last:mb-0">
            {renderInline(block.text, block.key)}
          </p>
        );
      })}
    </div>
  );
}
