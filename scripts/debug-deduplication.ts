/**
 * Debug Semantic Deduplication
 * 
 * Quick test to see what's happening with the deduplication
 */

import { SemanticNodeDeduplicator } from '../src/lib/graph/semantic-deduplicator';
import { EmbeddingService } from '../src/lib/embeddings/embedding-service';
import { AIOrchestrator } from '../src/services/ai-orchestrator.service';
import { logger } from '../src/utils/logger.util';
import { env } from '../src/config/env';

// Mock AIOrchestrator (not used yet)
const mockAI = {} as AIOrchestrator;

// Real embedding service
const embeddingService = new EmbeddingService(
  {
    apiKey: env.OPENAI_API_KEY || '',
    model: 'text-embedding-3-large',
    batchSize: 100,
    timeout: 30000,
  },
  logger
);

const deduplicator = new SemanticNodeDeduplicator(
  logger,
  mockAI,
  embeddingService
);

// Test nodes from academic paper
const testNodes = [
  { id: '1', title: 'Timeline Summarization', description: 'General task' },
  { id: '2', title: 'Event Timeline Summarization', description: 'Event-based approach' },
  { id: '3', title: 'Topic Timeline Summarization', description: 'Topic-based approach' },
  { id: '4', title: 'LLM-TLS', description: 'Our proposed system' },
  { id: '5', title: 'LLM based Timeline Summarization', description: 'Full name' },
  { id: '6', title: 'Event Clustering', description: 'Technique used' },
  { id: '7', title: 'Topic Modeling', description: 'Another technique' },
  { id: '8', title: 'Machine Learning', description: 'General field' },
  { id: '9', title: 'ML', description: 'Acronym for Machine Learning' },
];

async function test() {
  console.log('\n🔍 Testing Semantic Deduplication\n');
  console.log('Input nodes:', testNodes.length);
  testNodes.forEach((n, i) => console.log(`  ${i + 1}. ${n.title}`));

  const result = await deduplicator.deduplicate({ nodes: testNodes });

  console.log('\n📊 Results:');
  console.log('  Original:', result.statistics.originalCount);
  console.log('  Final:', result.statistics.finalCount);
  console.log('  Merged:', result.statistics.mergedCount);
  console.log('  By phase:', JSON.stringify(result.statistics.mergesByPhase, null, 2));

  console.log('\n✅ Deduplicated Nodes:');
  result.deduplicatedNodes.forEach((n, i) => {
    console.log(`  ${i + 1}. ${n.title}`);
  });

  console.log('\n🔗 Mapping:');
  Object.entries(result.mapping).forEach(([oldId, newId]) => {
    if (oldId !== newId) {
      const oldNode = testNodes.find(n => n.id === oldId);
      const newNode = result.deduplicatedNodes.find(n => n.id === newId);
      console.log(`  "${oldNode?.title}" -> "${newNode?.title}"`);
    }
  });

  process.exit(0);
}

test().catch(console.error);
