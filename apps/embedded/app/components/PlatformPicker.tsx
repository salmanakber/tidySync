"use client";

import { Text } from "@shopify/polaris";

export interface PlatformOption {
  key: string;
  name: string;
  blurb: string;
  category?: string;
}

interface PlatformPickerProps {
  platforms: PlatformOption[];
  value: string;
  onChange: (key: string) => void;
  detectedKey?: string | null;
  detectedConfidence?: number;
  label?: string;
}

export function PlatformPicker({
  platforms,
  value,
  onChange,
  detectedKey,
  detectedConfidence,
  label = "Platform",
}: PlatformPickerProps) {
  return (
    <div>
      {(label || detectedKey) && (
        <div style={{ marginBottom: 10 }}>
          {label ? (
            <Text as="h3" variant="headingSm">
              {label}
            </Text>
          ) : null}
          {detectedKey && (
            <Text as="p" variant="bodySm" tone="subdued">
              Auto-detected{" "}
              <strong>{platforms.find((p) => p.key === detectedKey)?.name ?? detectedKey}</strong>
              {detectedConfidence != null
                ? ` (${Math.round(detectedConfidence * 100)}% confidence)`
                : ""}
              . You can change it below.
            </Text>
          )}
        </div>
      )}
      <div className="tidysync-platform-grid">
        {platforms.map((p) => {
          const selected = value === p.key;
          const isDetected = detectedKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              className={`tidysync-platform-chip${selected ? " is-selected" : ""}${
                isDetected ? " is-detected" : ""
              }`}
              onClick={() => onChange(p.key)}
            >
              <span className="tidysync-platform-chip-name">
                {p.name}
                {isDetected && <span className="tidysync-platform-pill">Detected</span>}
              </span>
              <span className="tidysync-platform-chip-blurb">{p.blurb}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
