# Graph Generation Test Script

## Overview

End-to-end test script that demonstrates the complete Phase 3 graph generation pipeline:

**PDF → Extract → Chunk → AI → Deduplicate → Validate → Mermaid**

## Quick Start

```bash
# Generate graph from PDF
npm run generate-graph /Users/waynewang/Graphex-server/2024.acl-long.390.pdf
```

## What It Does

The script performs the following steps:

1. **Initialize Services** - Sets up all Phase 3 components
2. **Extract PDF** - Uses DocumentProcessorService to extract text
3. **Estimate Cost** - Pre-flight budget check with token estimation
4. **Generate Graph** - Complete pipeline with progress tracking:
   - Text chunking (30k chars max, 1k overlap)
   - Batched AI processing (2 chunks at a time)
   - Multi-phase node deduplication
   - Edge remapping (prevents orphaned edges)
   - Edge deduplication
   - Validation with auto-fix
5. **Display Results** - Shows statistics and graph quality metrics
6. **Save Output** - Creates markdown file with Mermaid diagram
7. **Preview** - Displays Mermaid code in terminal

## Output

The script generates a markdown file in `output/` with:

- **Graph Statistics** - Nodes, edges, quality score, cost, timing
- **Node List** - All concepts with descriptions
- **Relationship List** - All connections explained
- **Mermaid Diagram** - Ready to visualize
- **Visualization Links** - Quick links to rendering tools

### Example Output Location

```
output/
└── 2024.acl-long.390_graph_2024-11-12T23-45-30.md
```

## Visualizing the Graph

Copy the Mermaid code from the output file and paste it into:

1. **[Mermaid Live Editor](https://mermaid.live)** - Interactive online editor
2. **GitHub** - Native Mermaid support in markdown
3. **VS Code** - Install [Mermaid extension](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)

## Requirements

Before running:

1. **Services must be running**:
   ```bash
   npm run up
   ```

2. **Environment variables** must be configured in `.env`:
   - `ANTHROPIC_API_KEY` - For Claude AI
   - `OPENAI_API_KEY` - For fallback
   - `DATABASE_URL` - PostgreSQL connection
   - `REDIS_URL` - Redis connection

3. **Database must be migrated**:
   ```bash
   npm run prisma:migrate
   ```

## Example Usage

```bash
# Basic usage
npm run generate-graph /path/to/document.pdf

# With direct path
npx tsx scripts/test-graph-generation.ts /Users/waynewang/Documents/research-paper.pdf
```

## Pipeline Flow

```
PDF File
  ↓
DocumentProcessor: Extract text + images
  ↓
Cost Estimation: Check budget + estimate tokens
  ↓
TextChunker: Split into 30k char chunks with 1k overlap
  ↓
AIOrchestrator: Process 2 chunks at a time
  ↓
NodeDeduplicator: Exact → Acronym → Fuzzy matching
  ↓
EdgeRemapper: Update edge IDs (prevents orphaned edges)
  ↓
EdgeDeduplicator: Remove duplicate relationships
  ↓
GraphValidator: Validate + auto-fix issues
  ↓
Mermaid Generator: Create diagram syntax
  ↓
Markdown File: Complete graph documentation
```

## Cost

The script estimates cost before processing and aborts if budget insufficient.

**Typical costs**:
- Small PDF (5-10 pages): $0.001 - $0.003
- Medium PDF (20-30 pages): $0.005 - $0.010
- Large PDF (50+ pages): $0.015 - $0.030

Costs are 60-70% lower with caching on repeat runs.

## Troubleshooting

### "File not found"
Ensure the PDF path is absolute and the file exists.

### "Insufficient budget"
Check cost estimation output. You may need to increase budget limits in environment variables.

### "Services not running"
Run `npm run up` to start PostgreSQL and Redis.

### "AI API error"
Verify `ANTHROPIC_API_KEY` is set correctly in `.env`.

## Technical Details

### All Critical Fixes Implemented

1. ✅ **Correct merge order** - Dedupe nodes → Remap edges → Dedupe edges
2. ✅ **Cost estimation** - Pre-flight budget check
3. ✅ **Rate limiting** - Batch processing (2 chunks)
4. ✅ **Fallback** - Structure-based graph when AI fails
5. ✅ **Multi-phase deduplication** - Exact + Acronym + Fuzzy
6. ✅ **Validation auto-fix** - Removes orphaned edges, duplicates
7. ✅ **Chunking optimization** - 30k max, 1k overlap
8. ✅ **Edge deduplication** - After remapping

### Performance

- **Text chunking**: ~50ms per 100k chars
- **Node deduplication**: <1s for 100 nodes
- **Graph validation**: <5ms
- **Total pipeline**: Dominated by AI calls (80-90% of time)

## Related Documentation

- [GRAPH_GENERATOR_IMPLEMENTATION.md](../docs/GRAPH_GENERATOR_IMPLEMENTATION.md) - Complete implementation details
- [META/PROGRESS.md](../META/PROGRESS.md) - Phase 3.3 completion report
- [META/TODO.md](../META/TODO.md) - Current development priorities
