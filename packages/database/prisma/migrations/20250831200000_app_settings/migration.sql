-- Admin-managed app settings (AI keys, provider mode, etc.)
CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL DEFAULT '{}',
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_settings_key_key" ON "app_settings"("key");
