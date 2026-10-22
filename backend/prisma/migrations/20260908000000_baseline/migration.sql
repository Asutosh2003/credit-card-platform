-- Baseline schema for databases created before Prisma Migrate was enabled.
-- The role column is intentionally named lendinghub_roles here; the next
-- migration renames it to loanhub_roles.

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "lendinghub_roles" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_system_admin" BOOLEAN NOT NULL DEFAULT false,
    "reset_token_expires_at" TIMESTAMP(3),
    "reset_token_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schema_fields" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "column_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "length" INTEGER,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_primary_key" BOOLEAN NOT NULL DEFAULT false,
    "is_auto" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "schema_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connector_sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'IdentitySphere Connector',
    "key_prefix" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "total_bytes_sent" BIGINT NOT NULL DEFAULT 0,
    "total_requests" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "connector_sites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connector_access_events" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "bytes_out" INTEGER NOT NULL DEFAULT 0,
    "record_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "connector_access_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provision_requests" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "target_user_login" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "raw_payload" JSONB NOT NULL DEFAULT '{}',
    "reject_message" TEXT,
    "created_user_id" TEXT,
    "requested_by_user_id" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'identitysphere',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "provision_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_user_id_key" ON "users"("user_id");
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");
CREATE UNIQUE INDEX "schema_fields_entity_type_column_name_key" ON "schema_fields"("entity_type", "column_name");
CREATE UNIQUE INDEX "connector_sites_key_prefix_key" ON "connector_sites"("key_prefix");
CREATE INDEX "connector_access_events_site_id_created_at_idx" ON "connector_access_events"("site_id", "created_at" DESC);
CREATE INDEX "connector_access_events_created_at_idx" ON "connector_access_events"("created_at" DESC);
CREATE INDEX "provision_requests_status_created_at_idx" ON "provision_requests"("status", "created_at" DESC);
CREATE INDEX "provision_requests_target_user_login_status_idx" ON "provision_requests"("target_user_login", "status");

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "connector_access_events" ADD CONSTRAINT "connector_access_events_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "connector_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
