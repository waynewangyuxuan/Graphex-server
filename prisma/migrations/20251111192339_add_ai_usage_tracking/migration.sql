-- CreateTable: AI Usage Tracking
-- Purpose: Track all AI API usage for cost management and budget enforcement
-- CRITICAL: This table prevents financial disaster by monitoring costs

CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "quality_score" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "document_id" TEXT,
    "graph_id" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: User usage queries (daily/monthly limits)
CREATE INDEX "ai_usage_user_id_timestamp_idx" ON "ai_usage"("user_id", "timestamp");

-- CreateIndex: Operation-based analytics
CREATE INDEX "ai_usage_operation_idx" ON "ai_usage"("operation");

-- CreateIndex: Time-based queries (cost trends)
CREATE INDEX "ai_usage_timestamp_idx" ON "ai_usage"("timestamp");

-- CreateIndex: Document-related cost tracking
CREATE INDEX "ai_usage_document_id_idx" ON "ai_usage"("document_id");

-- CreateIndex: Graph-related cost tracking
CREATE INDEX "ai_usage_graph_id_idx" ON "ai_usage"("graph_id");
