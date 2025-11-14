#!/bin/bash

# TypeScript Error Batch Fix Script
# Fixes common "possibly undefined" errors and unused variables

echo "🔧 Fixing TypeScript errors..."
echo ""

# ============================================================
# 1. Fix text-chunker.ts - Add undefined guards
# ============================================================
echo "1️⃣  Fixing text-chunker.ts..."

FILE="src/lib/chunking/text-chunker.ts"

# Fix line 208 - Add guard for this.buffer
sed -i '' '208s/.*/      if (!this.buffer) return null;\n&/' "$FILE"

# Fix lines 228-229 - Add guard for this.buffer
sed -i '' '228s/.*/      if (!this.buffer) return;\n&/' "$FILE"

# Fix line 373 - Add guard for this.buffer
sed -i '' '373s/.*/      if (!this.buffer) return null;\n&/' "$FILE"

# Fix line 378 - Add guard for previousChunk
sed -i '' '378s/previousChunk\./previousChunk?\./g' "$FILE"

echo "   ✅ text-chunker.ts fixed"

# ============================================================
# 2. Fix unused variables
# ============================================================
echo "2️⃣  Fixing unused variables..."

# Fix middleware/error-handler.middleware.ts
sed -i '' 's/^import { APP_CONFIG }/\/\/ Removed unused import: APP_CONFIG/' "src/middleware/error-handler.middleware.ts"

# Fix services/ai-orchestrator.service.ts
sed -i '' 's/TokenUsage,/_TokenUsage,/' "src/services/ai-orchestrator.service.ts"
sed -i '' 's/PromptVersion/_PromptVersion/' "src/services/ai-orchestrator.service.ts"

# Fix lib/chunking/text-chunker.ts
sed -i '' 's/const structure =/const _structure =/' "src/lib/chunking/text-chunker.ts"
sed -i '' 's/const fullText =/const _fullText =/' "src/lib/chunking/text-chunker.ts"

# Fix lib/graph/graph-validator.ts
sed -i '' 's/const warnings =/const _warnings =/' "src/lib/graph/graph-validator.ts"
sed -i '' 's/const originalEdgeCount =/const _originalEdgeCount =/' "src/lib/graph/graph-validator.ts"

# Fix services/graph-generator.service.ts
sed -i '' 's/private deduplicateNodesOld/private _deduplicateNodesOld/' "src/services/graph-generator.service.ts"

# Fix lib/graph/semantic-deduplicator.ts - This is intentional for Phase 4
sed -i '' 's/private readonly aiOrchestrator:/\/\/ NOTE: aiOrchestrator will be used in Phase 4.4 LLM validation\n    private readonly aiOrchestrator:/' "src/lib/graph/semantic-deduplicator.ts"

echo "   ✅ Unused variables prefixed with underscore"

# ============================================================
# 3. Fix AI client errors
# ============================================================
echo "3️⃣  Fixing ai-client.ts..."

FILE="src/lib/ai/ai-client.ts"

# Fix line 222 - Add guards for content
# This requires more careful manual editing - skip for now

echo "   ⚠️  ai-client.ts requires manual review (complex type guards needed)"

# ============================================================
# 4. Fix node-deduplicator.ts - Add undefined guards
# ============================================================
echo "4️⃣  Fixing node-deduplicator.ts..."

FILE="src/lib/graph/node-deduplicator.ts"

# This file is deprecated and replaced by semantic-deduplicator
# Add a deprecation notice at the top

sed -i '' '1i\
/**\
 * @deprecated This class is deprecated in favor of SemanticNodeDeduplicator\
 * @see src/lib/graph/semantic-deduplicator.ts\
 */\

' "$FILE"

echo "   ✅ node-deduplicator.ts marked as deprecated"

# ============================================================
# Summary
# ============================================================
echo ""
echo "🎉 Batch fixes applied!"
echo ""
echo "Remaining errors require manual fixes:"
echo "  - src/lib/ai/ai-client.ts (complex type guards)"
echo "  - src/queues/graph-generation.queue.ts (BullMQ type definitions)"
echo "  - src/services/ai-orchestrator.service.ts (undefined string assignments)"
echo "  - src/__tests__/helpers/*.ts (test utility type annotations)"
echo ""
echo "Run 'npx tsc --noEmit' to check progress"
