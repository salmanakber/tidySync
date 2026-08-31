"use client";

import { useState } from "react";
import { Button, Icon, Spinner } from "@shopify/polaris";
import {
  ImportIcon,
  DatabaseIcon,
  MagicIcon,
  CheckIcon,
} from "@shopify/polaris-icons";
import { PlatformPicker, type PlatformOption } from "./PlatformPicker";
import { FileDropzone } from "./FileDropzone";
import type { ImportProgressState } from "./ImportProgressLoader";

const STEPS = [
  { id: "source", label: "Source platform" },
  { id: "upload", label: "Upload catalog" },
  { id: "backup", label: "Safety snapshot" },
  { id: "map", label: "Map columns" },
  { id: "review", label: "Review & go live" },
];

interface MigrationWizardProps {
  platforms: PlatformOption[];
  importPlatform: string;
  onPlatformChange: (key: string) => void;
  detectedPlatform?: string | null;
  detectedConfidence?: number;
  onUpload: (file: File) => Promise<void>;
  onCreateBackup: () => Promise<void>;
  onOpenMapping: () => void;
  importProgress: ImportProgressState | null;
  mappingReady: boolean;
  backupCreated: boolean;
  loading: boolean;
}

export function MigrationWizard({
  platforms,
  importPlatform,
  onPlatformChange,
  detectedPlatform,
  detectedConfidence,
  onUpload,
  onCreateBackup,
  onOpenMapping,
  importProgress,
  mappingReady,
  backupCreated,
  loading,
}: MigrationWizardProps) {
  const [step, setStep] = useState(0);
  const [backupLoading, setBackupLoading] = useState(false);
  const [skippedBackup, setSkippedBackup] = useState(false);

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      await onCreateBackup();
      setSkippedBackup(false);
      goNext();
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="tidysync-migration">
      <header className="tidysync-migration-hero">
        <span className="tidysync-migration-badge">
          <Icon source={ImportIcon} />
          Migration wizard
        </span>
        <h2>Move your catalog to Shopify safely</h2>
        <p>
          Guided migration from WooCommerce, Amazon, Etsy, and 15+ platforms — with optional vault snapshot
          before anything goes live.
        </p>
      </header>

      <nav className="tidysync-migration-steps" aria-label="Migration steps">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`tidysync-migration-step${i === step ? " is-active" : ""}${i < step ? " is-done" : ""}`}
            onClick={() => setStep(i)}
          >
            <span className="tidysync-migration-step-num">
              {i < step ? <Icon source={CheckIcon} /> : i + 1}
            </span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="tidysync-migration-panel">
        {step === 0 && (
          <div className="tidysync-migration-step-content">
            <h3>Where is your catalog today?</h3>
            <p>We auto-detect columns after upload — pick the closest source platform.</p>
            <PlatformPicker
              platforms={platforms}
              value={importPlatform}
              onChange={onPlatformChange}
              detectedKey={detectedPlatform}
              detectedConfidence={detectedConfidence}
              label="Source platform"
            />
            <div className="tidysync-migration-actions">
              <Button variant="primary" onClick={goNext}>Continue</Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="tidysync-migration-step-content">
            <h3>Upload your product file</h3>
            <p>CSV or XLSX export from your old platform. We analyze columns in the background.</p>
            {importProgress && importProgress.phase !== "failed" ? (
              <div className="tidysync-migration-progress">
                <Spinner size="small" />
                <span>{importProgress.message ?? "Processing…"}</span>
              </div>
            ) : (
              <FileDropzone onFile={async (file) => {
                await onUpload(file);
                goNext();
              }} disabled={loading} />
            )}
            <div className="tidysync-migration-actions">
              <Button onClick={goBack}>Back</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="tidysync-migration-step-content">
            <h3>Safety snapshot (recommended)</h3>
            <p>
              Create a vault backup of your current Shopify catalog before importing. Roll back anytime if
              something looks wrong.
            </p>
            <div className="tidysync-migration-backup-card">
              <Icon source={DatabaseIcon} />
              <div>
                <strong>Catalog vault snapshot</strong>
                <span>Full JSON backup stored in TidySync</span>
              </div>
              {backupCreated ? (
                <span className="tidysync-migration-done">Snapshot ready</span>
              ) : (
                <Button onClick={() => handleBackup()} loading={backupLoading}>
                  Create backup
                </Button>
              )}
            </div>
            <div className="tidysync-migration-actions">
              <Button onClick={goBack}>Back</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!backupCreated) setSkippedBackup(true);
                  goNext();
                }}
              >
                {backupCreated ? "Continue" : skippedBackup ? "Continue without backup" : "Skip for now"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="tidysync-migration-step-content">
            <h3>Map your columns</h3>
            <p>Match spreadsheet columns to Shopify fields. AI can suggest mappings automatically.</p>
            <div className="tidysync-migration-map-card">
              <Icon source={MagicIcon} />
              <div>
                <strong>Column mapper</strong>
                <span>
                  {mappingReady
                    ? "Mappings saved — ready for preview"
                    : "Open the mapper to connect your file columns"}
                </span>
              </div>
              <Button variant="primary" onClick={onOpenMapping}>
                {mappingReady ? "Edit mappings" : "Open column mapper"}
              </Button>
            </div>
            <div className="tidysync-migration-actions">
              <Button onClick={goBack}>Back</Button>
              <Button variant="primary" onClick={goNext} disabled={!mappingReady}>
                Continue to review
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="tidysync-migration-step-content">
            <h3>Review and go live</h3>
            <p>
              Open the column mapper preview, confirm every row, then approve the import job. Nothing is
              created in Shopify until you confirm.
            </p>
            <ul className="tidysync-migration-checklist">
              <li className={importPlatform ? "is-done" : ""}>Source platform selected</li>
              <li className={mappingReady ? "is-done" : ""}>Columns mapped</li>
              <li className={backupCreated || skippedBackup ? "is-done" : ""}>
                {backupCreated ? "Vault backup created" : "Backup skipped or pending"}
              </li>
            </ul>
            <div className="tidysync-migration-actions">
              <Button onClick={goBack}>Back</Button>
              <Button variant="primary" onClick={onOpenMapping} disabled={!mappingReady}>
                Review changes & import
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
