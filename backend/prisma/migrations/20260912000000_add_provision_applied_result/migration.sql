ALTER TABLE "provision_requests"
ADD COLUMN "applied_result" JSONB NOT NULL DEFAULT '{}';
