"use client";

import { useMemo, useState } from "react";
import {
  BlockStack,
  Button,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  describeImportCondition,
  IMPORT_CONDITION_ACTIONS,
  IMPORT_CONDITION_OPERATORS,
  IMPORT_CONDITION_PRESETS,
  type ImportCondition,
  type ImportConditionAction,
  type ImportConditionOperator,
} from "@tidysync/shared/import-settings";

interface MappingRow {
  sourceColumn: string;
  targetField: string;
}

interface FieldOption {
  label: string;
  value: string;
}

interface ImportConditionBuilderProps {
  mappings: MappingRow[];
  fieldOptions: FieldOption[];
  previewRows?: Array<Record<string, unknown>>;
  conditions: ImportCondition[];
  onChange: (conditions: ImportCondition[]) => void;
}

function sampleValuesForField(
  mappings: MappingRow[],
  previewRows: Array<Record<string, unknown>> | undefined,
  field: string,
): string[] {
  const mapping = mappings.find((m) => m.targetField === field);
  if (!mapping || !previewRows?.length) return [];
  const col = mapping.sourceColumn;
  const vals = new Set<string>();
  for (const row of previewRows) {
    const v = row[col];
    if (v != null && String(v).trim()) vals.add(String(v).trim());
  }
  return Array.from(vals).slice(0, 20);
}

const DEFAULT_DRAFT = {
  field: "vendor",
  operator: "eq" as ImportConditionOperator,
  value: "",
  action: "multiply_price" as ImportConditionAction,
  actionValue: "0.9",
  actionField: "vendor",
};

export function ImportConditionBuilder({
  mappings,
  fieldOptions,
  previewRows,
  conditions,
  onChange,
}: ImportConditionBuilderProps) {
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [showExamples, setShowExamples] = useState(false);

  const actionMeta = IMPORT_CONDITION_ACTIONS.find((a) => a.value === draft.action);
  const sampleValues = useMemo(
    () => sampleValuesForField(mappings, previewRows, draft.field),
    [mappings, previewRows, draft.field],
  );

  const mappedSourceLabel = mappings.find((m) => m.targetField === draft.field)?.sourceColumn;

  const addRule = () => {
    if (!draft.field || !draft.value.trim()) return;
    if (actionMeta?.needsValue && !String(draft.actionValue ?? "").trim()) return;
    if (actionMeta?.needsField && !draft.actionField) return;

    const rule: ImportCondition = {
      id: `cond-${Date.now()}-${conditions.length}`,
      field: draft.field,
      operator: draft.operator,
      value: draft.value.trim(),
      action: draft.action,
      actionValue: actionMeta?.needsValue ? draft.actionValue : undefined,
      actionField: actionMeta?.needsField ? draft.actionField : undefined,
      label: describeImportCondition({
        ...draft,
        id: "",
        value: draft.value.trim(),
        actionValue: actionMeta?.needsValue ? draft.actionValue : undefined,
        actionField: actionMeta?.needsField ? draft.actionField : undefined,
      }),
    };
    onChange([...conditions, rule]);
    setDraft((d) => ({ ...DEFAULT_DRAFT, field: d.field }));
  };

  if (fieldOptions.length === 0) {
    return (
      <div className="tidysync-mapping-conditions">
        <Text as="h4" variant="headingSm">Conditional import rules</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Map at least one column above, then build rules like “if vendor equals your brand, reduce price 10%”.
        </Text>
      </div>
    );
  }

  return (
    <div className="tidysync-mapping-conditions">
      <Text as="h4" variant="headingSm">Conditional import rules</Text>
      <Text as="p" variant="bodySm" tone="subdued">
        Build your own rules from mapped columns in your file — e.g. if a row&apos;s vendor matches a value you
        choose, change price, add a tag, or skip the row.
      </Text>

      <div className="tidysync-condition-builder">
        <div className="tidysync-condition-builder-grid">
          <Select
            label="When field"
            options={fieldOptions}
            value={draft.field}
            onChange={(v) => setDraft((d) => ({ ...d, field: v }))}
          />
          <Select
            label="Condition"
            options={IMPORT_CONDITION_OPERATORS.map((o) => ({ label: o.label, value: o.value }))}
            value={draft.operator}
            onChange={(v) => setDraft((d) => ({ ...d, operator: v as ImportConditionOperator }))}
          />
          <div className="tidysync-condition-value-field">
            <TextField
              label="Value"
              value={draft.value}
              onChange={(v) => setDraft((d) => ({ ...d, value: v }))}
              placeholder="Type a value from your file"
              autoComplete="off"
            />
            {sampleValues.length > 0 && (
              <div className="tidysync-condition-samples">
                <span className="tidysync-condition-samples-label">
                  In your file{mappedSourceLabel ? ` (${mappedSourceLabel})` : ""}:
                </span>
                <div className="tidysync-condition-samples-chips">
                  {sampleValues.map((val) => (
                    <button
                      key={val}
                      type="button"
                      className="tidysync-chip tidysync-chip-sm"
                      onClick={() => setDraft((d) => ({ ...d, value: val }))}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Select
            label="Then"
            options={IMPORT_CONDITION_ACTIONS.map((a) => ({ label: a.label, value: a.value }))}
            value={draft.action}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                action: v as ImportConditionAction,
                actionValue:
                  v === "multiply_price"
                    ? d.actionValue || "0.9"
                    : v === "set_compare_at_percent"
                      ? d.actionValue || "15"
                      : d.actionValue,
              }))
            }
          />
          {actionMeta?.needsField && (
            <Select
              label="Target field"
              options={fieldOptions}
              value={draft.actionField ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, actionField: v }))}
            />
          )}
          {actionMeta?.needsValue && (
            <TextField
              label={actionMeta.valueLabel ?? "Value"}
              value={String(draft.actionValue ?? "")}
              onChange={(v) => setDraft((d) => ({ ...d, actionValue: v }))}
              placeholder={actionMeta.valuePlaceholder}
              autoComplete="off"
            />
          )}
        </div>
        <div className="tidysync-condition-builder-actions">
          <Button onClick={addRule} variant="primary">
            Add rule
          </Button>
        </div>
      </div>

      {conditions.length > 0 && (
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" fontWeight="semibold">Active rules ({conditions.length})</Text>
          {conditions.map((c) => (
            <div key={c.id} className="tidysync-condition-card">
              <InlineStack align="space-between" blockAlign="start" wrap>
                <Text as="p" variant="bodyMd">{describeImportCondition(c)}</Text>
                <Button
                  size="slim"
                  onClick={() => onChange(conditions.filter((x) => x.id !== c.id))}
                >
                  Remove
                </Button>
              </InlineStack>
            </div>
          ))}
        </BlockStack>
      )}

      <div className="tidysync-condition-examples">
        <button
          type="button"
          className="tidysync-condition-examples-toggle"
          onClick={() => setShowExamples((s) => !s)}
        >
          {showExamples ? "Hide example rules" : "Show example rules (not from your file)"}
        </button>
        {showExamples && (
          <div className="tidysync-condition-presets">
            <Text as="p" variant="bodySm" tone="subdued">
              These are generic templates — edit values after adding to match your catalog.
            </Text>
            {IMPORT_CONDITION_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="tidysync-chip"
                onClick={() =>
                  onChange([
                    ...conditions,
                    { ...preset.condition, id: `cond-${Date.now()}-${conditions.length}` },
                  ])
                }
              >
                + {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
