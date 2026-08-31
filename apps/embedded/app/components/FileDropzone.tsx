"use client";

import { useCallback, useState } from "react";
import { BlockStack, Text, InlineStack, Spinner, Icon } from "@shopify/polaris";
import { UploadIcon, FileIcon } from "@shopify/polaris-icons";

interface FileDropzoneProps {
  loading?: boolean;
  disabled?: boolean;
  accept?: string;
  onFile: (file: File) => void | Promise<void>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzone({
  loading = false,
  disabled = false,
  accept = ".csv,.xlsx,.xls",
  onFile,
}: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);

  const takeFile = useCallback(
    (file?: File | null) => {
      if (!file || disabled || loading) return;
      setFileName(file.name);
      setFileSize(file.size);
      onFile(file);
    },
    [disabled, loading, onFile],
  );

  return (
    <div
      className={`tidysync-dropzone${dragging ? " is-dragging" : ""}${loading ? " is-uploading" : ""}${disabled ? " is-disabled" : ""}`}
      role="button"
      tabIndex={disabled || loading ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled || loading) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement | null)?.click();
        }
      }}
      onClick={() => {
        /* label handles file picker */
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        takeFile(e.dataTransfer.files?.[0]);
      }}
    >
      <label className="tidysync-dropzone-label">
        <input
          type="file"
          accept={accept}
          disabled={disabled || loading}
          className="tidysync-dropzone-input"
          onChange={(e) => {
            takeFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="tidysync-dropzone-icon">
          {loading ? <Spinner size="small" /> : <Icon source={UploadIcon} tone="success" />}
        </div>

        <BlockStack gap="100">
          <Text as="p" variant="headingSm">
            {loading
              ? "Uploading & analyzing…"
              : dragging
                ? "Drop to upload"
                : "Drag & drop your CSV or Excel file"}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            or click to browse · .csv, .xlsx · Max recommended 50MB
          </Text>
        </BlockStack>

        {loading && (
          <div style={{ marginTop: 16 }}>
            <div className="tidysync-shimmer-bar" />
          </div>
        )}

        {fileName && !loading && (
          <div className="tidysync-file-pill">
            <Icon source={FileIcon} tone="base" />
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodySm" fontWeight="semibold">
                {fileName}
              </Text>
              {fileSize != null && (
                <Text as="span" variant="bodySm" tone="subdued">
                  {formatBytes(fileSize)}
                </Text>
              )}
            </InlineStack>
          </div>
        )}
      </label>
    </div>
  );
}
