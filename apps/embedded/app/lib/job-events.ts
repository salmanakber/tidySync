export interface JobProgressEvent {
  jobId: string;
  status: string;
  processedCount: number;
  successCount: number;
  failedCount: number;
  rowCount: number;
}

/** Live job updates via SSE (server pushes — not client polling). */
export function subscribeToJobProgress(
  jobId: string,
  shop: string,
  onUpdate: (event: JobProgressEvent) => void,
  onError?: () => void,
): () => void {
  const base =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/graphql$/, "") ??
    (typeof window !== "undefined" ? "" : "");
  const url = `${base}/jobs/${encodeURIComponent(jobId)}/events?shop=${encodeURIComponent(shop)}`;

  const es = new EventSource(url);

  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data) as JobProgressEvent;
      onUpdate(data);
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(data.status)) {
        es.close();
      }
    } catch {
      /* ignore malformed events */
    }
  };

  es.onerror = () => {
    es.close();
    onError?.();
  };

  return () => es.close();
}
