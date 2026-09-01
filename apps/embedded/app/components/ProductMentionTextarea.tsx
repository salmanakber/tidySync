"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gqlRequest, QUERIES } from "../lib/graphql";

interface CatalogProduct {
  id: string;
  title: string;
  handle?: string | null;
}

interface ProductMentionTextareaProps {
  shop: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  hint?: string;
}

export function ProductMentionTextarea({
  shop,
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled,
  id,
  className,
  hint,
}: ProductMentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionReplaceStart, setMentionReplaceStart] = useState(0);
  const [mentionReplaceEnd, setMentionReplaceEnd] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const loadProducts = useCallback(
    async (query?: string) => {
      setLoadingProducts(true);
      try {
        const data = await gqlRequest<{ catalogProducts: CatalogProduct[] }>(
          QUERIES.catalogProducts,
          { first: 40, query: query?.trim() || null },
          shop,
        );
        setProducts(data.catalogProducts);
      } catch {
        setProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    },
    [shop],
  );

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const filtered = useMemo(() => {
    const q = mentionFilter.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.handle?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 12);
  }, [products, mentionFilter]);

  useEffect(() => {
    if (!mentionOpen) return;
    const q = mentionFilter.trim();
    if (q.length >= 2) {
      const t = window.setTimeout(() => void loadProducts(q), 200);
      return () => window.clearTimeout(t);
    }
  }, [mentionFilter, mentionOpen, loadProducts]);

  const updateMentionState = (text: string, cursor: number) => {
    const before = text.slice(0, cursor);
    const atMatch = before.match(/@([^\n@]*)$/);
    if (atMatch) {
      setMentionOpen(true);
      setMentionFilter(atMatch[1]);
      setMentionReplaceStart(cursor - atMatch[0].length);
      setMentionReplaceEnd(cursor);
      setHighlightIndex(0);
    } else {
      setMentionOpen(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    updateMentionState(v, e.target.selectionStart ?? v.length);
  };

  const insertProduct = (title: string) => {
    const safeTitle = title.replace(/"/g, "'");
    const insert = `@${safeTitle}`;
    const next = `${value.slice(0, mentionReplaceStart)}${insert} ${value.slice(mentionReplaceEnd)}`;
    onChange(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = mentionReplaceStart + insert.length + 1;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionOpen || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertProduct(filtered[highlightIndex]?.title ?? "");
    } else if (e.key === "Escape") {
      setMentionOpen(false);
    }
  };

  return (
    <div className="tidysync-mention-wrap">
      <textarea
        ref={textareaRef}
        id={id}
        className={className ?? "tidysync-agent-pro-input"}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) =>
          updateMentionState(value, (e.target as HTMLTextAreaElement).selectionStart ?? value.length)
        }
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
      />
      {hint ? <span className="tidysync-mention-hint">{hint}</span> : null}
      {mentionOpen && (
        <div className="tidysync-mention-dropdown" role="listbox">
          <div className="tidysync-mention-dropdown-head">
            <span>Products</span>
            {loadingProducts ? <span className="tidysync-mention-loading">Searching…</span> : null}
          </div>
          {filtered.length === 0 ? (
            <p className="tidysync-mention-empty">No matching products — keep typing or check catalog sync.</p>
          ) : (
            <ul>
              {filtered.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`tidysync-mention-option${i === highlightIndex ? " is-active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertProduct(p.title);
                    }}
                  >
                    <span className="tidysync-mention-option-title">{p.title}</span>
                    {p.handle ? <span className="tidysync-mention-option-handle">{p.handle}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="tidysync-mention-tip">Type @ to mention a product · ↑↓ to navigate · Enter to select</p>
        </div>
      )}
    </div>
  );
}
