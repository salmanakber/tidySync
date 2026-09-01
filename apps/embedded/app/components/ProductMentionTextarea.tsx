"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const MENTION_TOKEN_RE = /\{\{mention:([^|]+)\|([^|]*)\|([^}]+)\}\}/g;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shopHost(shop: string): string {
  return shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function productStoreUrl(shop: string, handle?: string | null): string | null {
  if (!handle?.trim()) return null;
  return `https://${shopHost(shop)}/products/${handle.trim()}`;
}

function tokensToPrompt(text: string): string {
  return text.replace(MENTION_TOKEN_RE, (_, _id, _handle, title) => `@${title}`);
}

export function mentionValueToPrompt(text: string): string {
  return tokensToPrompt(text);
}

function promptToTokens(text: string): string {
  return text;
}

function createMentionChip(product: CatalogProduct, shop: string): HTMLAnchorElement {
  const chip = document.createElement("a");
  chip.className = "tidysync-mention-chip";
  chip.textContent = product.title;
  chip.dataset.mentionId = product.id;
  chip.dataset.mentionHandle = product.handle ?? "";
  chip.dataset.mentionTitle = product.title;
  chip.contentEditable = "false";
  chip.draggable = false;
  const url = productStoreUrl(shop, product.handle);
  if (url) {
    chip.href = url;
    chip.target = "_blank";
    chip.rel = "noopener noreferrer";
  } else {
    chip.href = "#";
    chip.addEventListener("click", (e) => e.preventDefault());
  }
  return chip;
}

function serializeEditor(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.classList.contains("tidysync-mention-chip")) {
      const id = el.dataset.mentionId ?? "";
      const handle = el.dataset.mentionHandle ?? "";
      const title = el.dataset.mentionTitle ?? el.textContent ?? "";
      out += `{{mention:${id}|${handle}|${title}}}`;
      return;
    }
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return out;
}

function htmlFromTokens(text: string, shop: string): string {
  if (!text) return "";
  const parts: string[] = [];
  let last = 0;
  const re = new RegExp(MENTION_TOKEN_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(last, match.index);
    if (before) parts.push(escapeHtml(before));
    const id = match[1];
    const handle = match[2];
    const title = match[3];
    const url = productStoreUrl(shop, handle);
    const href = url ? escapeHtml(url) : "#";
    const target = url ? " target=\"_blank\" rel=\"noopener noreferrer\"" : "";
    parts.push(
      `<a class="tidysync-mention-chip" href="${href}"${target} contenteditable="false" data-mention-id="${escapeHtml(id)}" data-mention-handle="${escapeHtml(handle)}" data-mention-title="${escapeHtml(title)}">${escapeHtml(title)}</a>`,
    );
    last = match.index + match[0].length;
  }
  parts.push(escapeHtml(text.slice(last)));
  return parts.join("");
}

function getTextBeforeCursor(root: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return "";
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return "";

  const preRange = document.createRange();
  preRange.selectNodeContents(root);
  preRange.setEnd(range.startContainer, range.startOffset);
  const fragment = preRange.cloneContents();
  let text = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.classList.contains("tidysync-mention-chip")) {
      text += el.textContent ?? "";
      return;
    }
    el.childNodes.forEach(walk);
  };
  fragment.childNodes.forEach(walk);
  return text;
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
  const editorRef = useRef<HTMLDivElement>(null);
  const mentionAnchorRef = useRef<{ node: Node; offset: number } | null>(null);
  const skipExternalSync = useRef(false);

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 320 });

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

  const syncFromParent = useCallback(
    (nextValue: string) => {
      const el = editorRef.current;
      if (!el) return;
      const tokenized = promptToTokens(nextValue);
      el.innerHTML = htmlFromTokens(tokenized, shop);
    },
    [shop],
  );

  useEffect(() => {
    if (skipExternalSync.current) {
      skipExternalSync.current = false;
      return;
    }
    syncFromParent(value);
  }, [value, syncFromParent]);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const serialized = serializeEditor(el);
    skipExternalSync.current = true;
    onChange(serialized);
  }, [onChange]);

  const updateDropdownPosition = useCallback(() => {
    const sel = window.getSelection();
    const el = editorRef.current;
    if (!sel?.rangeCount || !el) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const editorRect = el.getBoundingClientRect();
    const width = Math.min(420, Math.max(280, editorRect.width));
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }
    setDropdownPos({
      top: rect.bottom + 6,
      left: Math.max(12, left),
      width,
    });
  }, []);

  const updateMentionState = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const textBefore = getTextBeforeCursor(el);
    const atMatch = textBefore.match(/@([^\n@]*)$/);
    if (atMatch) {
      const sel = window.getSelection();
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0);
        const anchorOffset = range.startOffset - atMatch[0].length;
        if (anchorOffset >= 0) {
          mentionAnchorRef.current = {
            node: range.startContainer,
            offset: anchorOffset,
          };
        }
      }
      setMentionOpen(true);
      setMentionFilter(atMatch[1]);
      setHighlightIndex(0);
      updateDropdownPosition();
    } else {
      setMentionOpen(false);
      mentionAnchorRef.current = null;
    }
  }, [updateDropdownPosition]);

  const insertProduct = (product: CatalogProduct) => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel) return;

    const anchor = mentionAnchorRef.current;
    const endRange = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!anchor || !endRange) return;

    const deleteRange = document.createRange();
    deleteRange.setStart(anchor.node, anchor.offset);
    deleteRange.setEnd(endRange.startContainer, endRange.startOffset);
    deleteRange.deleteContents();

    const chip = createMentionChip(product, shop);
    deleteRange.insertNode(chip);
    const space = document.createTextNode("\u00a0");
    chip.after(space);

    const cursorRange = document.createRange();
    cursorRange.setStartAfter(space);
    cursorRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(cursorRange);

    setMentionOpen(false);
    mentionAnchorRef.current = null;
    emitChange();
    el.focus();
  };

  const handleInput = () => {
    updateMentionState();
    emitChange();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!mentionOpen || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const product = filtered[highlightIndex];
      if (product) insertProduct(product);
    } else if (e.key === "Escape") {
      setMentionOpen(false);
    }
  };

  const minHeight = Math.max(96, rows * 24);

  const dropdown =
    mentionOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="tidysync-mention-dropdown is-portal"
            role="listbox"
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
            }}
          >
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
                        insertProduct(p);
                      }}
                    >
                      <span className="tidysync-mention-option-title">{p.title}</span>
                      {p.handle ? <span className="tidysync-mention-option-handle">{p.handle}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="tidysync-mention-tip">Type @ to mention · ↑↓ navigate · Enter to select</p>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="tidysync-mention-wrap">
      <div
        ref={editorRef}
        id={id}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={`tidysync-mention-editor ${className ?? "tidysync-agent-pro-input"}`}
        data-placeholder={placeholder}
        style={{ minHeight }}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={updateMentionState}
        onKeyUp={updateMentionState}
      />
      {hint ? <span className="tidysync-mention-hint">{hint}</span> : null}
      {dropdown}
    </div>
  );
}
