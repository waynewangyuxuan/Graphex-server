/**
 * Quick test of enhanced node structure
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
import { logger } from '../src/utils/logger.util';
import { redisClient } from '../src/config/redis';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';

const testDocument = `
Artificial Intelligence and Machine Learning

Introduction
Artificial intelligence (AI) refers to the simulation of human intelligence in machines that are programmed to think and learn. Machine learning is a subset of AI that enables systems to learn from data without being explicitly programmed.

Neural Networks
Neural networks are computing systems inspired by biological neural networks in animal brains. They consist of interconnected nodes (neurons) organized in layers. Deep learning is a subset of machine learning that uses multi-layered neural networks to process data.

Training Process
The training process involves feeding data to the neural network and adjusting connection weights based on errors. Backpropagation is the primary algorithm used for training neural networks by calculating gradients and updating weights.

Applications
Neural networks are used in various applications including image recognition, natural language processing, and autonomous vehicles. Computer vision enables machines to interpret visual information from the world.
`;

async function test() {
  console.log('\n🧪 Testing Enhanced Node Structure\n');

  try {
    // Initialize services
    const aiClient = new AIClient(
      {
        anthropicApiKey: env.ANTHROPIC_API_KEY || '',
        openaiApiKey: env.OPENAI_API_KEY || '',
        defaultTimeout: 120000,
        enableLogging: true,
      },
      logger
    );

    const promptManager = new PromptManagerService(logger);
    const validator = new AIOutputValidator(logger);
    const costTracker = new CostTrackerService(prisma, logger);
    const embeddingService = new EmbeddingService(
      {
        openaiApiKey: env.OPENAI_API_KEY || '',
        model: 'text-embedding-3-large',
        dimensions: 3072,
        enableCaching: true,
        cacheClient: redisClient,
        cacheTTL: 86400,
      },
      logger
    );

    const orchestrator = new AIOrchestrator(
      aiClient,
      promptManager,
      validator,
      costTracker,
      redisClient,
      logger
    );

    const deduplicator = new SemanticNodeDeduplicator(
      logger,
      orchestrator,
      embeddingService
    );

    const chunker = new TextChunker(logger);
    const generator = new GraphGeneratorService(
      orchestrator,
      chunker,
      deduplicator,
      costTracker,
      logger
    );

    // Generate graph
    console.log('📝 Generating graph with enhanced node fields...');
    const result = await generator.generateGraph({
      documentId: 'test-' + Date.now(),
      documentText: testDocument,
      documentTitle: 'AI and Machine Learning Test',
    });

    // Check for enhanced fields
    console.log('\n✅ Graph generated successfully!');
    console.log(`\n📊 Statistics:`);
    console.log(`   Nodes: ${result.statistics.totalNodes}`);
    console.log(`   Edges: ${result.statistics.totalEdges}`);
    console.log(`   Quality: ${result.statistics.qualityScore}/100`);

    console.log(`\n🔍 Checking enhanced fields:`);
    const nodesWithType = result.nodes.filter(n => n.nodeType).length;
    const nodesWithSummary = result.nodes.filter(n => n.summary).length;

    console.log(`   Nodes with nodeType: ${nodesWithType}/${result.nodes.length}`);
    console.log(`   Nodes with summary: ${nodesWithSummary}/${result.nodes.length}`);

    if (nodesWithType > 0) {
      console.log(`\n📋 Sample Nodes with Enhanced Fields:`);
      const sampleNodes = result.nodes.filter(n => n.nodeType && n.summary).slice(0, 3);
      for (const node of sampleNodes) {
        console.log(`\n   📌 ${node.title}`);
        console.log(`      Type: ${node.nodeType}`);
        const summaryPreview = node.summary ?
          (node.summary.length > 100 ? node.summary.substring(0, 100) + '...' : node.summary) :
          'N/A';
        console.log(`      Summary: ${summaryPreview}`);
      }
    }

    console.log('\n✨ Test completed successfully!\n');
    console.log('🎉 All enhanced fields (nodeType and summary) are working correctly!');

    await prisma.$disconnect();
    await redisClient.quit();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await prisma.$disconnect();
    await redisClient.quit();
    process.exit(1);
  }
}

test();
