const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function notifyJobComplete(tenantId: string, jobId: string, status: string) {
  try {
    await fetch(`${API_URL}/internal/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tidysync-internal": process.env.INTERNAL_SECRET ?? "dev" },
      body: JSON.stringify({ tenantId, jobId, status }),
    });
  } catch {
    /* optional internal hook */
  }
}
