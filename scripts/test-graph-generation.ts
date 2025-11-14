/**
 * End-to-End Graph Generation Test Script
 *
 * WHY: Demonstrates complete pipeline from PDF → Mermaid graph
 * Shows real-world usage of all Phase 3 components working together
 *
 * Usage: npx tsx scripts/test-graph-generation.ts <pdf-path>
 */

import { GraphGeneratorService } from '../src/services/graph-generator.service';
import { AIOrchestrator } from '../src/services/ai-orchestrator.service';
import { PromptManagerService } from '../src/services/prompt-manager.service';
import { AIOutputValidator } from '../src/lib/validation/ai-output-validator';
import { CostTrackerService } from '../src/services/cost-tracker.service';
import { AIClient } from '../src/lib/ai/ai-client';
import { TextChunker } from '../src/lib/chunking/text-chunker';
import { SemanticNodeDeduplicator } from '../src/lib/graph/semantic-deduplicator';
import { EmbeddingService } from '../src/lib/embeddings/embedding-service';
import { extractTextFromPDFBuffer } from '../src/lib/extraction/pdf-extractor';
import { logger } from '../src/utils/logger.util';
import { redisClient } from '../src/config/redis';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Main test function - orchestrates the entire pipeline
 */
async function testGraphGeneration(pdfPath: string) {
  console.log('\n🚀 Starting End-to-End Graph Generation Test\n');
  console.log('=' .repeat(80));

  try {
    // ============================================================================
    // STEP 1: Initialize Services
    // ============================================================================
    console.log('\n📦 Step 1: Initializing services...');

    // Initialize AI Client
    const aiClient = new AIClient(
      {
        anthropicApiKey: env.ANTHROPIC_API_KEY || '',
        openaiApiKey: env.OPENAI_API_KEY || '',
        defaultTimeout: 120000, // 2 minutes
        enableLogging: true,
      },
      logger
    );

    // Initialize services
    const textChunker = new TextChunker(logger);
    const costTracker = new CostTrackerService(logger, redisClient, prisma);
    const aiValidator = new AIOutputValidator();
    const promptManager = new PromptManagerService(redisClient, logger);
    const aiOrchestrator = new AIOrchestrator(
      aiClient,
      promptManager,
      aiValidator,
      costTracker,
      redisClient,
      logger
    );

    // Initialize embedding service for semantic deduplication
    const embeddingService = new EmbeddingService(
      {
        apiKey: env.OPENAI_API_KEY || '',
        model: 'text-embedding-3-large',
        batchSize: 100,
        timeout: 30000,
      },
      logger
    );

    // Initialize semantic deduplicator
    const semanticDeduplicator = new SemanticNodeDeduplicator(
      logger,
      aiOrchestrator,
      embeddingService
    );

    const graphGenerator = new GraphGeneratorService(
      textChunker,
      aiOrchestrator,
      costTracker,
      semanticDeduplicator,
      logger
    );

    console.log('✅ All services initialized');

    // ============================================================================
    // STEP 2: Extract PDF Content
    // ============================================================================
    console.log('\n📄 Step 2: Extracting PDF content...');

    const pdfBuffer = fs.readFileSync(pdfPath);
    const fileName = path.basename(pdfPath);

    console.log(`   File: ${fileName}`);
    console.log(`   Size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

    const extractionResult = await extractTextFromPDFBuffer(pdfBuffer);

    console.log(`✅ PDF extracted successfully`);
    console.log(`   Pages: ${extractionResult.pageCount}`);
    console.log(`   Text length: ${extractionResult.text.length.toLocaleString()} chars`);

    // ============================================================================
    // STEP 3: Estimate Cost
    // ============================================================================
    console.log('\n💰 Step 3: Estimating cost...');

    const costEstimate = await graphGenerator.estimateCost(extractionResult.text);

    console.log(`   Estimated chunks: ${costEstimate.estimatedChunks}`);
    console.log(`   Estimated tokens: ${costEstimate.estimatedTokens.toLocaleString()}`);
    console.log(`   Estimated cost: $${costEstimate.estimatedCost.toFixed(4)}`);
    console.log(`   Budget available: $${costEstimate.budgetCheck.available.toFixed(2)}`);
    console.log(`   Within budget: ${costEstimate.budgetCheck.withinBudget ? '✅ Yes' : '❌ No'}`);

    if (!costEstimate.budgetCheck.withinBudget) {
      throw new Error('Insufficient budget for this operation');
    }

    // ============================================================================
    // STEP 4: Generate Knowledge Graph
    // ============================================================================
    console.log('\n🧠 Step 4: Generating knowledge graph...');
    console.log('   This may take a few minutes for large documents...\n');

    const startTime = Date.now();
    let lastProgress = 0;

    const graphResult = await graphGenerator.generateGraph({
      documentId: 'test-doc-' + Date.now(),
      documentText: extractionResult.text,
      documentTitle: extractionResult.metadata.title || fileName,
    }, (progress) => {
      // Progress callback
      if (progress.percentComplete > lastProgress + 10) {
        console.log(`   Progress: ${progress.percentComplete}% (${progress.stage})`);
        lastProgress = progress.percentComplete;
      }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Graph generated successfully in ${duration}s`);

    // ============================================================================
    // STEP 5: Display Results
    // ============================================================================
    console.log('\n📊 Step 5: Graph Statistics');
    console.log('=' .repeat(80));
    console.log(`   Total nodes: ${graphResult.statistics.totalNodes}`);
    console.log(`   Total edges: ${graphResult.statistics.totalEdges}`);
    console.log(`   Merged nodes: ${graphResult.statistics.mergedNodes}`);
    console.log(`   Duplicate edges removed: ${graphResult.statistics.duplicateEdgesRemoved}`);
    console.log(`   Quality score: ${graphResult.statistics.qualityScore}/100`);
    console.log(`   Actual cost: $${graphResult.statistics.totalCost.toFixed(4)}`);
    console.log(`   Processing time: ${(graphResult.statistics.processingTimeMs / 1000).toFixed(1)}s`);
    console.log(`   Model used: ${graphResult.metadata.model}`);
    console.log(`   Cache hit: ${graphResult.metadata.cacheHit ? '✅ Yes' : '❌ No'}`);
    console.log(`   Fallback used: ${graphResult.metadata.fallbackUsed ? '⚠️ Yes' : '✅ No'}`);

    // ============================================================================
    // STEP 6: Save Mermaid Diagram
    // ============================================================================
    console.log('\n💾 Step 6: Saving Mermaid diagram...');

    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const baseName = path.basename(pdfPath, '.pdf');
    const outputPath = path.join(outputDir, `${baseName}_graph_${timestamp}.md`);

    // Create comprehensive markdown output
    const markdownContent = `# Knowledge Graph: ${graphResult.metadata.model}

**Generated from:** \`${fileName}\`
**Date:** ${new Date().toISOString()}
**Processing time:** ${(graphResult.statistics.processingTimeMs / 1000).toFixed(1)}s
**Cost:** $${graphResult.statistics.totalCost.toFixed(4)}

---

## Graph Statistics

- **Nodes:** ${graphResult.statistics.totalNodes}
- **Edges:** ${graphResult.statistics.totalEdges}
- **Chunks processed:** ${graphResult.statistics.chunksProcessed}
- **Merged nodes:** ${graphResult.statistics.mergedNodes}
- **Duplicate edges removed:** ${graphResult.statistics.duplicateEdgesRemoved}
- **Quality score:** ${graphResult.statistics.qualityScore}/100

---

## Nodes

${graphResult.nodes.map((node, i) => `${i + 1}. **${node.title}**${node.contentSnippet ? `\n   > ${node.contentSnippet}` : ''}`).join('\n')}

---

## Relationships

${graphResult.edges.map((edge, i) => {
  const fromNode = graphResult.nodes.find(n => n.id === edge.from);
  const toNode = graphResult.nodes.find(n => n.id === edge.to);
  return `${i + 1}. **${fromNode?.title || edge.from}** → \`${edge.relationship}\` → **${toNode?.title || edge.to}**`;
}).join('\n')}

---

## Mermaid Diagram

\`\`\`mermaid
${graphResult.mermaidCode}
\`\`\`

---

## How to Visualize

1. Copy the Mermaid code above
2. Paste it into one of these tools:
   - [Mermaid Live Editor](https://mermaid.live)
   - [GitHub Markdown](https://github.com) (supports Mermaid natively)
   - [VS Code with Mermaid extension](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)

---

*Generated with Graphex Graph Generation Pipeline v1.0*
`;

    fs.writeFileSync(outputPath, markdownContent, 'utf-8');

    console.log(`✅ Saved to: ${outputPath}`);

    // ============================================================================
    // STEP 7: Display Mermaid Code
    // ============================================================================
    console.log('\n📋 Step 7: Mermaid Code Preview');
    console.log('=' .repeat(80));
    console.log('\n```mermaid');
    console.log(graphResult.mermaidCode);
    console.log('```\n');

    // ============================================================================
    // STEP 8: Summary
    // ============================================================================
    console.log('=' .repeat(80));
    console.log('\n🎉 SUCCESS! Graph generation complete\n');
    console.log(`📁 Full output saved to: ${outputPath}`);
    console.log('\n💡 Next steps:');
    console.log('   1. Open the markdown file to see the full graph');
    console.log('   2. Copy the Mermaid code to https://mermaid.live to visualize');
    console.log('   3. Review nodes and relationships for quality');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Error during graph generation:');
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    await redisClient.quit();
    await prisma.$disconnect();
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Usage: npx tsx scripts/test-graph-generation.ts <pdf-path>');
  console.error('Example: npx tsx scripts/test-graph-generation.ts /path/to/document.pdf');
  process.exit(1);
}

if (!fs.existsSync(pdfPath)) {
  console.error(`Error: File not found: ${pdfPath}`);
  process.exit(1);
}

if (path.extname(pdfPath).toLowerCase() !== '.pdf') {
  console.error('Error: File must be a PDF');
  process.exit(1);
}

// Run the test
testGraphGeneration(pdfPath).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
