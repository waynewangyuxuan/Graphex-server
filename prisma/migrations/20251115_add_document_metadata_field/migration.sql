-- Add metadata JSONB field to documents table
-- This field stores textBlocks with PDF coordinates, pageCount, wordCount, etc.

ALTER TABLE "documents" ADD COLUMN "metadata" JSONB;

-- Add comment for documentation
COMMENT ON COLUMN "documents"."metadata" IS 'JSONB field storing document processing metadata including textBlocks with PDF coordinates for precise highlighting';
