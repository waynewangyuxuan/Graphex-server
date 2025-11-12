-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('pdf', 'text', 'markdown', 'url');

-- CreateEnum
CREATE TYPE "GraphStatus" AS ENUM ('generating', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "QuizDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content_text" TEXT NOT NULL,
    "file_path" TEXT,
    "source_url" TEXT,
    "source_type" "SourceType" NOT NULL,
    "file_size" INTEGER,
    "status" "DocumentStatus" NOT NULL DEFAULT 'processing',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graphs" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "mermaid_code" TEXT NOT NULL,
    "layout_config" JSONB,
    "generation_model" TEXT NOT NULL,
    "status" "GraphStatus" NOT NULL DEFAULT 'generating',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graphs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL,
    "graph_id" TEXT NOT NULL,
    "node_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content_snippet" TEXT,
    "document_refs" JSONB,
    "position_x" DOUBLE PRECISION,
    "position_y" DOUBLE PRECISION,
    "metadata" JSONB,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edges" (
    "id" TEXT NOT NULL,
    "graph_id" TEXT NOT NULL,
    "from_node_id" TEXT NOT NULL,
    "to_node_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "ai_explanation" TEXT,
    "strength" DOUBLE PRECISION,
    "metadata" JSONB,

    CONSTRAINT "edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "node_id" TEXT,
    "edge_id" TEXT,
    "graph_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" TEXT NOT NULL,
    "graph_id" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_answer" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "difficulty" "QuizDifficulty" NOT NULL DEFAULT 'medium',
    "node_refs" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_created_at_idx" ON "documents"("created_at");

-- CreateIndex
CREATE INDEX "graphs_document_id_idx" ON "graphs"("document_id");

-- CreateIndex
CREATE INDEX "graphs_status_idx" ON "graphs"("status");

-- CreateIndex
CREATE INDEX "graphs_created_at_idx" ON "graphs"("created_at");

-- CreateIndex
CREATE INDEX "nodes_graph_id_idx" ON "nodes"("graph_id");

-- CreateIndex
CREATE INDEX "nodes_node_key_idx" ON "nodes"("node_key");

-- CreateIndex
CREATE UNIQUE INDEX "nodes_graph_id_node_key_key" ON "nodes"("graph_id", "node_key");

-- CreateIndex
CREATE INDEX "edges_graph_id_idx" ON "edges"("graph_id");

-- CreateIndex
CREATE INDEX "edges_from_node_id_to_node_id_idx" ON "edges"("from_node_id", "to_node_id");

-- CreateIndex
CREATE INDEX "edges_from_node_id_idx" ON "edges"("from_node_id");

-- CreateIndex
CREATE INDEX "edges_to_node_id_idx" ON "edges"("to_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "edges_graph_id_from_node_id_to_node_id_key" ON "edges"("graph_id", "from_node_id", "to_node_id");

-- CreateIndex
CREATE INDEX "notes_graph_id_idx" ON "notes"("graph_id");

-- CreateIndex
CREATE INDEX "notes_node_id_idx" ON "notes"("node_id");

-- CreateIndex
CREATE INDEX "notes_edge_id_idx" ON "notes"("edge_id");

-- CreateIndex
CREATE INDEX "quiz_questions_graph_id_idx" ON "quiz_questions"("graph_id");

-- CreateIndex
CREATE INDEX "quiz_questions_difficulty_idx" ON "quiz_questions"("difficulty");

-- AddForeignKey
ALTER TABLE "graphs" ADD CONSTRAINT "graphs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_from_node_id_fkey" FOREIGN KEY ("from_node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_to_node_id_fkey" FOREIGN KEY ("to_node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_edge_id_fkey" FOREIGN KEY ("edge_id") REFERENCES "edges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
