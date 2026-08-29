"use client";

import { useEffect, useState, useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/admin/api/graphql";

async function adminGql<T>(
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-tidysync-admin-token"] = token;

  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

interface Tenant {
  id: string;
  shopDomain: string;
  shopName?: string;
  status: string;
  billingStatus?: string;
  productCount: number;
  aiCreditsUsed: number;
  extraAiCredits?: number;
  plan?: { name: string; slug?: string };
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  maxProducts: number;
  aiCreditsPerMonth: number;
  priceMonthlyCents: number;
  isFree: boolean;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  tenant?: { shopDomain: string };
}

interface Job {
  id: string;
  type: string;
  status: string;
  rowCount: number;
  successCount: number;
  failedCount: number;
  errorSummary?: string;
  createdAt: string;
}

interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  description?: string;
}

interface AuditLog {
  id: string;
  action: string;
  createdAt: string;
  tenant?: { shopDomain: string };
}

type Tab = "overview" | "tenants" | "jobs" | "billing" | "flags" | "apikeys" | "health" | "audit";

export function AdminConsole() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [health, setHealth] = useState<Record<string, unknown>>({});
  const [stats, setStats] = useState<Record<string, number>>({});
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [grantCredits, setGrantCredits] = useState("10");
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("tidysync_admin_token");
    if (saved) setToken(saved);
  }, []);

  const loadData = async (authToken: string) => {
    try {
      const [tenantsData, jobsData, statsData, flagsData, auditData, plansData, healthData, keysData] =
        await Promise.all([
        adminGql<{ adminTenants: Tenant[] }>(
          `query { adminTenants(limit: 100) { id shopDomain shopName status billingStatus productCount aiCreditsUsed extraAiCredits plan { name slug } } }`,
          {},
          authToken,
        ),
        adminGql<{ adminJobs: Job[] }>(
          `query { adminJobs(limit: 200) { id type status rowCount successCount failedCount errorSummary createdAt } }`,
          {},
          authToken,
        ),
        adminGql<{ adminJobStats: Record<string, number> }>(`query { adminJobStats }`, {}, authToken),
        adminGql<{ adminFeatureFlags: FeatureFlag[] }>(
          `query { adminFeatureFlags { id key enabled description } }`,
          {},
          authToken,
        ),
        adminGql<{ adminAuditLogs: AuditLog[] }>(
          `query { adminAuditLogs(limit: 100) { id action createdAt tenant { shopDomain } } }`,
          {},
          authToken,
        ),
        adminGql<{ adminPlans: Plan[] }>(
          `query { adminPlans { id name slug maxProducts aiCreditsPerMonth priceMonthlyCents isFree } }`,
          {},
          authToken,
        ),
        adminGql<{ adminSystemHealth: Record<string, unknown> }>(`query { adminSystemHealth }`, {}, authToken),
        adminGql<{ adminApiKeys: ApiKey[] }>(
          `query { adminApiKeys { id name keyPrefix scopes createdAt tenant { shopDomain } } }`,
          {},
          authToken,
        ),
      ]);
      setTenants(tenantsData.adminTenants);
      setJobs(jobsData.adminJobs);
      setStats(statsData.adminJobStats);
      setFlags(flagsData.adminFeatureFlags);
      setAuditLogs(auditData.adminAuditLogs);
      setPlans(plansData.adminPlans);
      setHealth(healthData.adminSystemHealth);
      setApiKeys(keysData.adminApiKeys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  };

  useEffect(() => {
    if (token) loadData(token);
  }, [token]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminGql<{
        adminLogin: { token: string; user: { email: string } };
      }>(
        `mutation($email: String!, $password: String!) {
          adminLogin(email: $email, password: $password) { token user { email } }
        }`,
        { email, password },
      );
      localStorage.setItem("tidysync_admin_token", data.adminLogin.token);
      setToken(data.adminLogin.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const filteredTenants = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => t.shopDomain.toLowerCase().includes(q) || t.shopName?.toLowerCase().includes(q));
  }, [tenants, search]);

  const filteredJobs = useMemo(() => {
    let list = jobs;
    if (jobFilter) list = list.filter((j) => j.status === jobFilter);
    const q = search.toLowerCase();
    if (q) list = list.filter((j) => j.type.toLowerCase().includes(q) || j.id.includes(q));
    return list;
  }, [jobs, search, jobFilter]);

  const statusBadge = (status: string) => {
    const cls =
      status === "COMPLETED" || status === "ACTIVE"
        ? "badge-success"
        : status === "FAILED" || status === "SUSPENDED"
          ? "badge-critical"
          : status === "RUNNING"
            ? "badge-info"
            : "badge-attention";
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  const retryJob = async (jobId: string) => {
    if (!token) return;
    await adminGql(
      `mutation($jobId: ID!) { adminRetryJob(jobId: $jobId) { id status } }`,
      { jobId },
      token,
    );
    await loadData(token);
  };

  const toggleFlag = async (key: string, enabled: boolean) => {
    if (!token) return;
    await adminGql(
      `mutation($key: String!, $enabled: Boolean!) { adminUpdateFeatureFlag(key: $key, enabled: $enabled) { id enabled } }`,
      { key, enabled },
      token,
    );
    await loadData(token);
  };

  const updateTenantPlan = async (tenantId: string, planSlug: string) => {
    if (!token) return;
    await adminGql(
      `mutation($tenantId: ID!, $planSlug: String!) { adminUpdateTenantPlan(tenantId: $tenantId, planSlug: $planSlug) { id } }`,
      { tenantId, planSlug },
      token,
    );
    await loadData(token);
  };

  const updateTenantStatus = async (tenantId: string, status: string) => {
    if (!token) return;
    await adminGql(
      `mutation($tenantId: ID!, $status: String!) { adminUpdateTenantStatus(tenantId: $tenantId, status: $status) { id } }`,
      { tenantId, status },
      token,
    );
    await loadData(token);
  };

  const grantTenantCredits = async (tenantId: string, credits: number) => {
    if (!token) return;
    await adminGql(
      `mutation($tenantId: ID!, $credits: Int!) { adminGrantCredits(tenantId: $tenantId, credits: $credits) { id } }`,
      { tenantId, credits },
      token,
    );
    await loadData(token);
  };

  const createApiKey = async () => {
    if (!token || !selectedTenantId || !newApiKeyName.trim()) return;
    const data = await adminGql<{
      adminCreateApiKey: { rawKey: string; keyPrefix: string };
    }>(
      `mutation($tenantId: ID!, $name: String!, $scopes: [String!]) {
        adminCreateApiKey(tenantId: $tenantId, name: $name, scopes: $scopes) { rawKey keyPrefix }
      }`,
      { tenantId: selectedTenantId, name: newApiKeyName, scopes: ["export", "jobs"] },
      token,
    );
    setCreatedApiKey(data.adminCreateApiKey.rawKey);
    setNewApiKeyName("");
    await loadData(token);
  };

  const revokeApiKey = async (id: string) => {
    if (!token) return;
    await adminGql(`mutation($id: ID!) { adminRevokeApiKey(id: $id) }`, { id }, token);
    await loadData(token);
  };

  if (!token) {
    return (
      <div style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
        <h1 style={{ marginBottom: 8 }}>TidySync Admin</h1>
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>Internal ops console</p>
        {error && <p style={{ color: "var(--critical)" }}>{error}</p>}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn" onClick={handleLogin} disabled={loading}>Sign in</button>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "tenants", label: "Tenants" },
    { id: "jobs", label: "Jobs" },
    { id: "billing", label: "Billing" },
    { id: "flags", label: "Feature flags" },
    { id: "apikeys", label: "API keys" },
    { id: "health", label: "System health" },
    { id: "audit", label: "Audit log" },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>TidySync Admin</h1>
          <p style={{ color: "var(--muted)", margin: 4 }}>sync.tidyflowapp.com</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => token && loadData(token)}>Refresh</button>
          <button
            className="btn"
            onClick={() => {
              localStorage.removeItem("tidysync_admin_token");
              setToken(null);
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className="btn"
            style={{ opacity: tab === t.id ? 1 : 0.6 }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {(tab === "tenants" || tab === "jobs") && (
        <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          {tab === "jobs" && (
            <select className="input" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="">All statuses</option>
              <option value="RUNNING">RUNNING</option>
              <option value="FAILED">FAILED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="QUEUED">QUEUED</option>
            </select>
          )}
        </div>
      )}

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Total jobs", value: stats.total ?? 0 },
            { label: "Running", value: stats.running ?? 0 },
            { label: "Failed", value: stats.failed ?? 0 },
            { label: "Completed", value: stats.completed ?? 0 },
          ].map((s) => (
            <div key={s.label} className="card">
              <div style={{ color: "var(--muted)", fontSize: 11 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "tenants" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Tenants ({filteredTenants.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Status</th>
                <th>Products</th>
                <th>AI credits</th>
                <th>Plan</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((t) => (
                <tr key={t.id}>
                  <td>{t.shopDomain}</td>
                  <td>{statusBadge(t.status)}</td>
                  <td>{t.productCount}</td>
                  <td>{t.aiCreditsUsed}{t.extraAiCredits ? ` +${t.extraAiCredits}` : ""}</td>
                  <td>{t.plan?.name ?? "—"}</td>
                  <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <select
                      className="input"
                      value={t.plan?.slug ?? ""}
                      onChange={(e) => updateTenantPlan(t.id, e.target.value)}
                      style={{ maxWidth: 120 }}
                    >
                      {plans.map((p) => (
                        <option key={p.slug} value={p.slug}>{p.name}</option>
                      ))}
                    </select>
                    {t.status === "ACTIVE" ? (
                      <button className="btn" onClick={() => updateTenantStatus(t.id, "SUSPENDED")}>Suspend</button>
                    ) : (
                      <button className="btn" onClick={() => updateTenantStatus(t.id, "ACTIVE")}>Activate</button>
                    )}
                    <button className="btn" onClick={() => grantTenantCredits(t.id, 10)}>+10 credits</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "jobs" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Jobs ({filteredJobs.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Success</th>
                <th>Failed</th>
                <th>Error</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.type}</td>
                  <td>{statusBadge(j.status)}</td>
                  <td>{j.rowCount}</td>
                  <td>{j.successCount}</td>
                  <td>{j.failedCount}</td>
                  <td style={{ color: "var(--critical)", maxWidth: 200 }}>{j.errorSummary ?? "—"}</td>
                  <td>{new Date(j.createdAt).toLocaleString()}</td>
                  <td>
                    {j.status === "FAILED" && (
                      <button className="btn" onClick={() => retryJob(j.id)}>Retry</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "billing" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Plans</h2>
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Products</th>
                <th>AI credits/mo</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.maxProducts.toLocaleString()}</td>
                  <td>{p.aiCreditsPerMonth}</td>
                  <td>{p.isFree ? "Free" : `$${(p.priceMonthlyCents / 100).toFixed(0)}/mo`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Grant credits to tenant</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="input" value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)}>
              <option value="">Select tenant</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.shopDomain}</option>
              ))}
            </select>
            <input className="input" value={grantCredits} onChange={(e) => setGrantCredits(e.target.value)} style={{ maxWidth: 80 }} />
            <button
              className="btn"
              onClick={() => selectedTenantId && grantTenantCredits(selectedTenantId, Number(grantCredits) || 10)}
            >
              Grant credits
            </button>
          </div>
        </div>
      )}

      {tab === "apikeys" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>API keys</h2>
          {createdApiKey && (
            <p style={{ color: "var(--success)", marginBottom: 12 }}>
              New key (copy now — shown once): <code>{createdApiKey}</code>
            </p>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <select className="input" value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)}>
              <option value="">Select tenant</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.shopDomain}</option>
              ))}
            </select>
            <input className="input" placeholder="Key name" value={newApiKeyName} onChange={(e) => setNewApiKeyName(e.target.value)} />
            <button className="btn" onClick={createApiKey}>Create key</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Name</th>
                <th>Prefix</th>
                <th>Scopes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((k) => (
                <tr key={k.id}>
                  <td>{k.tenant?.shopDomain ?? "—"}</td>
                  <td>{k.name}</td>
                  <td>{k.keyPrefix}…</td>
                  <td>{k.scopes.join(", ")}</td>
                  <td><button className="btn" onClick={() => revokeApiKey(k.id)}>Revoke</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "health" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>System health</h2>
          <pre style={{ fontSize: 13 }}>{JSON.stringify(health, null, 2)}</pre>
        </div>
      )}

      {tab === "flags" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Feature flags</h2>
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Description</th>
                <th>Enabled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.id}>
                  <td>{f.key}</td>
                  <td>{f.description ?? "—"}</td>
                  <td>{statusBadge(f.enabled ? "ACTIVE" : "SUSPENDED")}</td>
                  <td>
                    <button className="btn" onClick={() => toggleFlag(f.key, !f.enabled)}>
                      {f.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Audit log</h2>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Shop</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                  <td>{log.tenant?.shopDomain ?? "—"}</td>
                  <td>{log.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
