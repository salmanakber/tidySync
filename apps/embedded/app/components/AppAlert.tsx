"use client";

import { useEffect } from "react";
import { Banner } from "@shopify/polaris";
import type { AppAlertModel } from "../lib/graphql-errors";

export type { AppAlertModel };

interface AppAlertProps extends Omit<AppAlertModel, "id"> {
  onDismiss?: () => void;
}

export function AppAlert({
  tone,
  title,
  message,
  primaryAction,
  secondaryAction,
  onDismiss,
}: AppAlertProps) {
  return (
    <Banner
      tone={tone}
      title={title}
      onDismiss={onDismiss}
      action={primaryAction}
      secondaryAction={secondaryAction}
    >
      {message}
    </Banner>
  );
}

function isToastAlert(alert: AppAlertModel): boolean {
  return alert.tone === "success" || alert.code === "JOB_SUCCESS" || alert.code === "JOB_FAILED";
}

interface AppAlertStackProps {
  alerts: AppAlertModel[];
  onDismiss?: (id: string) => void;
  /** "banners" = inline Polaris banners; "toasts" = fixed auto-dismiss toasts; "all" = both */
  mode?: "banners" | "toasts" | "all";
}

function ToastAlert({
  alert,
  onDismiss,
}: {
  alert: AppAlertModel;
  onDismiss?: (id: string) => void;
}) {
  const ms = alert.autoDismissMs ?? (alert.tone === "success" ? 4500 : undefined);

  useEffect(() => {
    if (!ms || !onDismiss) return;
    const t = window.setTimeout(() => onDismiss(alert.id), ms);
    return () => window.clearTimeout(t);
  }, [alert.id, ms, onDismiss]);

  return (
    <div
      className={`tidysync-toast is-${alert.tone}`}
      role="status"
      aria-live="polite"
    >
      <div className="tidysync-toast-body">
        {alert.title ? <p className="tidysync-toast-title">{alert.title}</p> : null}
        <p className="tidysync-toast-message">{alert.message}</p>
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="tidysync-toast-close"
          aria-label="Dismiss"
          onClick={() => onDismiss(alert.id)}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function AppAlertStack({ alerts, onDismiss, mode = "all" }: AppAlertStackProps) {
  if (alerts.length === 0) return null;

  const toasts = alerts.filter(isToastAlert);
  const banners = alerts.filter((a) => !isToastAlert(a));
  const showBanners = mode === "banners" || mode === "all";
  const showToasts = mode === "toasts" || mode === "all";

  return (
    <>
      {showBanners && banners.length > 0 && (
        <div className="tidysync-alert-stack">
          {banners.map((alert) => (
            <AppAlert
              key={alert.id}
              tone={alert.tone}
              title={alert.title}
              message={alert.message}
              primaryAction={alert.primaryAction}
              secondaryAction={alert.secondaryAction}
              onDismiss={onDismiss ? () => onDismiss(alert.id) : undefined}
            />
          ))}
        </div>
      )}
      {showToasts && toasts.length > 0 && (
        <div className="tidysync-toast-stack" aria-live="polite">
          {toasts.map((alert) => (
            <ToastAlert key={alert.id} alert={alert} onDismiss={onDismiss} />
          ))}
        </div>
      )}
    </>
  );
}
