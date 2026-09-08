"use client";

import { Button, Icon, Text } from "@shopify/polaris";
import { MagicIcon } from "@shopify/polaris-icons";
import { ProductMentionTextarea } from "./ProductMentionTextarea";

const PROMPT_CHIPS = [
  "Change title of @ to … and set price to …",
  "Increase all prices by 10%",
  "Improve SEO and description for @",
  "Add tag needs-review to products tagged Sale",
];

interface AiStudioProps {
  shop: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  creditsRemaining?: number | string;
  error?: string | null;
}

export function AiStudio({
  shop,
  value,
  onChange,
  onSubmit,
  loading = false,
  creditsRemaining,
  error,
}: AiStudioProps) {
  return (
    <div className={`tidysync-ai-studio${loading ? " is-generating" : ""}`}>
      <div className="tidysync-ai-studio-aura" aria-hidden="true" />
      <header className="tidysync-ai-studio-head">
        <div className="tidysync-ai-studio-icon">
          <Icon source={MagicIcon} />
        </div>
        <div className="tidysync-ai-studio-copy">
          <span className="tidysync-ai-badge">AI Edit</span>
          <Text as="h3" variant="headingMd">
            Tell me what to change
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Write like you&apos;d message a teammate — title, price, tags, SEO. Type <strong>@</strong> to pick a
            product. I&apos;ll show a clear preview and wait for your OK before anything goes live.
          </Text>
        </div>
      </header>

      <div className="tidysync-ai-composer">
        <label className="tidysync-ai-composer-label" htmlFor="ai-bulk-prompt">
          Your request
        </label>
        <div className="tidysync-ai-composer-box">
          <div className="tidysync-ai-composer-input-wrap">
            <ProductMentionTextarea
              shop={shop}
              id="ai-bulk-prompt"
              value={value}
              onChange={onChange}
                    placeholder="e.g. Change title of @Classic Tee to Blue Hoodie and set price to 29.99"
              rows={5}
              disabled={loading}
              className="tidysync-ai-mention-input"
              hint={error ? undefined : "Always @mention the product so only that item changes — never the whole store"}
            />
          </div>
          <div className="tidysync-ai-composer-footer">
            <div className="tidysync-ai-composer-meta">
              <span className="tidysync-ai-credit-pill">
                {creditsRemaining != null ? `${creditsRemaining} credits left` : "Uses 1 credit"}
              </span>
              <span className="tidysync-ai-safe-note">Preview first · apply after you confirm</span>
            </div>
            <Button variant="primary" onClick={onSubmit} loading={loading} disabled={!value.trim()}>
              {loading ? "Understanding…" : "Preview changes"}
            </Button>
          </div>
        </div>
        {error ? <p className="tidysync-field-error">{error}</p> : null}
      </div>

      <div className="tidysync-prompt-chips" role="list">
        {PROMPT_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="tidysync-chip"
            disabled={loading}
            onClick={() => onChange(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      {loading && (
        <div className="tidysync-ai-generating" aria-live="polite">
          <Text as="p" variant="bodySm" tone="subdued">
            Reading your request and matching products…
          </Text>
          <div className="tidysync-generating-line" style={{ width: "92%" }} />
          <div className="tidysync-generating-line" style={{ width: "74%" }} />
          <div className="tidysync-generating-line" style={{ width: "58%" }} />
        </div>
      )}
    </div>
  );
}
