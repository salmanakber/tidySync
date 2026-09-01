"use client";

import { Button, Icon, InlineStack, Text } from "@shopify/polaris";
import { MagicIcon } from "@shopify/polaris-icons";
import { ProductMentionTextarea } from "./ProductMentionTextarea";

const PROMPT_CHIPS = [
  "Increase all prices by 10%",
  "Improve SEO and description for @",
  "Add tag needs-review to products tagged Sale",
  "Set compare-at price 20% above price",
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
        <div>
          <Text as="h3" variant="headingSm">
            Natural language bulk edit
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Describe the change in plain English. Type <strong>@</strong> to mention a product. We build a mutation
            plan, show a full diff, and wait for your approval before anything runs.
          </Text>
        </div>
      </header>

      <div className="tidysync-ai-composer">
        <label className="tidysync-ai-composer-label" htmlFor="ai-bulk-prompt">
          What should we change?
        </label>
        <div className="tidysync-ai-composer-box">
          <ProductMentionTextarea
            shop={shop}
            id="ai-bulk-prompt"
            value={value}
            onChange={onChange}
            placeholder="e.g. Increase all Summer Collection prices by 10% · type @ to mention a product"
            rows={5}
            disabled={loading}
            className="tidysync-ai-mention-input"
            hint={error ? undefined : "Tip: type @ to search products by name"}
          />
          <div className="tidysync-ai-composer-footer">
            <Text as="span" variant="bodySm" tone="subdued">
              {creditsRemaining != null ? `${creditsRemaining} AI credits remaining` : "Uses 1 AI credit"}
            </Text>
            <Button variant="primary" onClick={onSubmit} loading={loading} disabled={!value.trim()}>
              Generate preview
            </Button>
          </div>
        </div>
        {error ? <p className="tidysync-field-error">{error}</p> : null}
      </div>

      <div className="tidysync-prompt-chips">
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
        <div className="tidysync-ai-generating">
          <Text as="p" variant="bodySm" tone="subdued">
            Building mutation plan…
          </Text>
          <div className="tidysync-generating-line" style={{ width: "92%" }} />
          <div className="tidysync-generating-line" style={{ width: "74%" }} />
          <div className="tidysync-generating-line" style={{ width: "58%" }} />
        </div>
      )}
    </div>
  );
}
