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
  { id: "source", label: "Source" },
  { id: "upload", label: "Upload" },
  { id: "backup", label: "Snapshot" },
  { id: "map", label: "Map" },
  { id: "review", label: "Review" },
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
    <div className="tidysync-studio tidysync-migration">
      <header className="tidysync-studio-hero">
        <div className="tidysync-studio-hero-pattern" aria-hidden="true" />
        <div className="tidysync-studio-hero-inner">
          <div className="tidysync-studio-hero-copy">
            <span className="tidysync-studio-badge is-brand">
              <Icon source={ImportIcon} />
              Migration wizard
            </span>
            <h2 className="tidysync-studio-title">Move your catalog to Shopify safely</h2>
            <p className="tidysync-studio-sub">
              WooCommerce, Amazon, Etsy, and 15+ platforms — with optional vault snapshot before anything goes live.
            </p>
          </div>
          <div className="tidysync-studio-progress-ring">
            <span className="tidysync-studio-progress-label">Step</span>
            <strong>{step + 1}</strong>
            <span className="tidysync-studio-progress-of">of {STEPS.length}</span>
          </div>
        </div>
      </header>

      <nav className="tidysync-studio-stepper" aria-label="Migration steps">
        {STEPS.map((s, i) => (
          <div key={s.id} className="tidysync-studio-stepper-item">
            <button
              type="button"
              className={`tidysync-studio-stepper-btn${i === step ? " is-active" : ""}${i < step ? " is-done" : ""}`}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="tidysync-studio-stepper-num">
                {i < step ? <Icon source={CheckIcon} /> : i + 1}
              </span>
              <span className="tidysync-studio-stepper-label">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span
                className={`tidysync-studio-stepper-line${i < step ? " is-done" : ""}`}
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </nav>

      <div className="tidysync-studio-panel">
        {step === 0 && (
          <>
            <div className="tidysync-studio-step-head">
              <h3>Where is your catalog today?</h3>
              <p>Pick the closest source platform. We auto-detect columns after you upload a file.</p>
            </div>
            <div className="tidysync-studio-step-body">
              <PlatformPicker
                platforms={platforms}
                value={importPlatform}
                onChange={onPlatformChange}
                detectedKey={detectedPlatform}
                detectedConfidence={detectedConfidence}
                label="Source platform"
              />
            </div>
            <div className="tidysync-studio-step-foot">
              <Button variant="primary" onClick={goNext}>Continue</Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="tidysync-studio-step-head">
              <h3>Upload your product file</h3>
              <p>CSV or XLSX export from your old platform. Column analysis runs in the background.</p>
            </div>
            <div className="tidysync-studio-step-body">
              {importProgress && importProgress.phase !== "failed" ? (
                <div className="tidysync-studio-loading-inline">
                  <Spinner size="small" />
                  <span>{importProgress.message ?? "Processing your file…"}</span>
                </div>
              ) : (
                <FileDropzone onFile={async (file) => {
                  await onUpload(file);
                  goNext();
                }} loading={loading} />
              )}
            </div>
            <div className="tidysync-studio-step-foot">
              <Button onClick={goBack}>Back</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="tidysync-studio-step-head">
              <h3>Safety snapshot</h3>
              <p>Recommended before importing — snapshot your current Shopify catalog so you can roll back anytime.</p>
            </div>
            <div className="tidysync-studio-step-body">
              <div className="tidysync-studio-option-card">
                <span className="tidysync-studio-option-icon is-vault">
                  <Icon source={DatabaseIcon} />
                </span>
                <div className="tidysync-studio-option-copy">
                  <strong>Catalog vault snapshot</strong>
                  <span>Full JSON backup stored in TidySync — restore with filters if needed.</span>
                </div>
                <div className="tidysync-studio-option-action">
                  {backupCreated ? (
                    <span className="tidysync-studio-tag is-success">Snapshot ready</span>
                  ) : (
                    <Button onClick={() => handleBackup()} loading={backupLoading}>
                      Create backup
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="tidysync-studio-step-foot">
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
          </>
        )}

        {step === 3 && (
          <>
            <div className="tidysync-studio-step-head">
              <h3>Map your columns</h3>
              <p>Match spreadsheet columns to Shopify fields. AI can suggest mappings automatically.</p>
            </div>
            <div className="tidysync-studio-step-body">
              <div className="tidysync-studio-option-card">
                <span className="tidysync-studio-option-icon is-ai">
                  <Icon source={MagicIcon} />
                </span>
                <div className="tidysync-studio-option-copy">
                  <strong>Column mapper</strong>
                  <span>
                    {mappingReady
                      ? "Mappings saved — ready for preview and import."
                      : "Open the mapper to connect file columns to Shopify."}
                  </span>
                </div>
                <div className="tidysync-studio-option-action">
                  <Button variant="primary" onClick={onOpenMapping}>
                    {mappingReady ? "Edit mappings" : "Open mapper"}
                  </Button>
                </div>
              </div>
            </div>
            <div className="tidysync-studio-step-foot">
              <Button onClick={goBack}>Back</Button>
              <Button variant="primary" onClick={goNext} disabled={!mappingReady}>
                Continue to review
              </Button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="tidysync-studio-step-head">
              <h3>Review and go live</h3>
              <p>Confirm every row in the preview, then approve the import. Nothing is created until you confirm.</p>
            </div>
            <div className="tidysync-studio-step-body">
              <ul className="tidysync-studio-checklist">
                <li className={importPlatform ? "is-done" : ""}>
                  <span className="tidysync-studio-check-icon">{importPlatform ? "✓" : "○"}</span>
                  Source platform selected
                </li>
                <li className={mappingReady ? "is-done" : ""}>
                  <span className="tidysync-studio-check-icon">{mappingReady ? "✓" : "○"}</span>
                  Columns mapped
                </li>
                <li className={backupCreated || skippedBackup ? "is-done" : ""}>
                  <span className="tidysync-studio-check-icon">
                    {backupCreated || skippedBackup ? "✓" : "○"}
                  </span>
                  {backupCreated ? "Vault backup created" : "Backup skipped or pending"}
                </li>
              </ul>
            </div>
            <div className="tidysync-studio-step-foot">
              <Button onClick={goBack}>Back</Button>
              <Button variant="primary" onClick={onOpenMapping} disabled={!mappingReady}>
                Review changes & import
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
