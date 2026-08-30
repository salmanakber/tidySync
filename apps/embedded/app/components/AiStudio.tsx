"use client";

import { BlockStack, Button, InlineStack, Text, TextField } from "@shopify/polaris";

const PROMPT_CHIPS = [
  "Increase all prices by 10%",
  "Change name of abc to Premium Leather Wallet",
  "Add tag needs-review to products tagged Sale",
  "Set compare-at price 20% above price",
];

interface AiStudioProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  creditsRemaining?: number | string;
  error?: string | null;
}

export function AiStudio({
  value,
  onChange,
  onSubmit,
  loading = false,
  creditsRemaining,
  error,
}: AiStudioProps) {
  return (
    <div className={`tidysync-ai-studio${loading ? " is-generating" : ""}`}>
      <div className="tidysync-ai-header">
        <span className="tidysync-ai-badge">AI</span>
        <BlockStack gap="100">
          <Text as="h3" variant="headingSm">
            Natural language bulk edit
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Describe the change. We build a plan, show a full diff, and wait for your explicit confirmation before anything runs in Shopify.
          </Text>
        </BlockStack>
      </div>

      <TextField
        label="What should we change?"
        labelHidden
        value={value}
        onChange={onChange}
        placeholder="e.g. Increase all Summer Collection prices by 10%"
        autoComplete="off"
        multiline={4}
        disabled={loading}
        error={error ?? undefined}
      />

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
        <div style={{ marginTop: 16 }}>
          <Text as="p" variant="bodySm" tone="subdued">
            Building mutation plan…
          </Text>
          <div className="tidysync-generating-line" style={{ width: "92%", marginTop: 10 }} />
          <div className="tidysync-generating-line" style={{ width: "74%" }} />
          <div className="tidysync-generating-line" style={{ width: "58%" }} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <InlineStack align="space-between" blockAlign="center">
          <Text as="span" variant="bodySm" tone="subdued">
            {creditsRemaining != null ? `${creditsRemaining} AI credits remaining` : "Uses 1 AI credit"}
          </Text>
          <Button
            variant="primary"
            onClick={onSubmit}
            loading={loading}
            disabled={!value.trim()}
          >
            Generate preview
          </Button>
        </InlineStack>
      </div>
    </div>
  );
}
