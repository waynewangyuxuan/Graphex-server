-- AlterTable
ALTER TABLE "nodes" ADD COLUMN     "node_type" TEXT,
ADD COLUMN     "summary" TEXT;

-- CreateIndex
CREATE INDEX "nodes_node_type_idx" ON "nodes"("node_type");
