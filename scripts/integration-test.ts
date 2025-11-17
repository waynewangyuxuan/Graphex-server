#!/usr/bin/env tsx
/**
 * Integration Test Runner
 *
 * Tests the complete pipeline from PDF upload to graph generation with
 * document references and coordinate matching.
 *
 * Usage:
 *   npm run integration-test
 *   or
 *   tsx scripts/integration-test.ts
 *
 * Test Stages:
 * 1. PDF Upload → Verify textBlocks extraction
 * 2. Graph Generation → Verify nodes created
 * 3. Document Refs → Verify coordinates populated
 * 4. API Response → Verify frontend receives correct data
 * 5. Cleanup → Remove test data
 */

import 'dotenv/config'; // Load environment variables
import fs from 'fs/promises';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import { prisma } from '../src/config/database';

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';
const TEST_PDF_PATH = path.join(__dirname, '../test-data/integration-test-paper.pdf');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results tracking
interface TestResult {
  stage: string;
  passed: boolean;
  message: string;
  duration: number;
  data?: any;
}

const results: TestResult[] = [];

/**
 * Log with color
 */
function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Log test stage
 */
function logStage(stage: string) {
  console.log('\n' + '='.repeat(60));
  log(`STAGE: ${stage}`, 'cyan');
  console.log('='.repeat(60));
}

/**
 * Log test result
 */
function logResult(result: TestResult) {
  const icon = result.passed ? '✓' : '✗';
  const color = result.passed ? 'green' : 'red';
  log(`${icon} ${result.stage} (${result.duration}ms)`, color);
  log(`  ${result.message}`, color);
}

/**
 * Test Stage 1: PDF Upload
 */
async function testPDFUpload(): Promise<{ documentId: string; textBlockCount: number }> {
  logStage('Stage 1: PDF Upload & Text Extraction');

  const startTime = Date.now();

  try {
    // Check if test PDF exists
    await fs.access(TEST_PDF_PATH);
    log(`✓ Test PDF found: ${TEST_PDF_PATH}`, 'green');

    // Upload PDF via API
    const formData = new FormData();
    const fileBuffer = await fs.readFile(TEST_PDF_PATH);
    formData.append('file', fileBuffer, {
      filename: 'integration-test-paper.pdf',
      contentType: 'application/pdf',
    });
    formData.append('title', 'Integration Test Paper');

    log('Uploading PDF...', 'blue');
    const uploadResponse = await axios.post(
      `${API_BASE_URL}/api/v1/documents`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 60000,
      }
    );

    if (!uploadResponse.data.success) {
      throw new Error('Upload failed: ' + JSON.stringify(uploadResponse.data.error));
    }

    const documentId = uploadResponse.data.data.id;
    log(`✓ Document uploaded: ${documentId}`, 'green');

    // Verify in database
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error('Document not found in database');
    }

    // Check metadata.textBlocks
    const metadata = document.metadata as any;
    if (!metadata || !Array.isArray(metadata.textBlocks)) {
      throw new Error('TextBlocks not found in metadata');
    }

    const textBlockCount = metadata.textBlocks.length;
    log(`✓ TextBlocks extracted: ${textBlockCount}`, 'green');

    // Verify textBlock structure
    const sampleBlock = metadata.textBlocks[0];
    if (!('page' in sampleBlock) || !sampleBlock.bbox || !sampleBlock.text) {
      throw new Error('Invalid textBlock structure');
    }

    log(`✓ TextBlock structure valid`, 'green');
    log(`  Sample: page=${sampleBlock.page}, text="${sampleBlock.text.substring(0, 50)}..."`, 'blue');

    const duration = Date.now() - startTime;
    results.push({
      stage: 'PDF Upload',
      passed: true,
      message: `Uploaded with ${textBlockCount} textBlocks`,
      duration,
      data: { documentId, textBlockCount },
    });

    return { documentId, textBlockCount };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    results.push({
      stage: 'PDF Upload',
      passed: false,
      message: `Failed: ${message}`,
      duration,
    });

    throw error;
  }
}

/**
 * Test Stage 2: Graph Generation
 */
async function testGraphGeneration(documentId: string): Promise<{ graphId: string; nodeCount: number }> {
  logStage('Stage 2: Graph Generation');

  const startTime = Date.now();

  try {
    log('Generating graph...', 'blue');
    const generateResponse = await axios.post(
      `${API_BASE_URL}/api/v1/graphs/generate`,
      {
        documentId,
        options: {
          maxNodes: 10,
        },
      },
      { timeout: 120000 }
    );

    if (!generateResponse.data.success) {
      throw new Error('Generation failed: ' + JSON.stringify(generateResponse.data.error));
    }

    const graphId = generateResponse.data.data.graphId;
    const nodeCount = generateResponse.data.data.nodeCount;

    log(`✓ Graph generated: ${graphId}`, 'green');
    log(`✓ Nodes created: ${nodeCount}`, 'green');

    // Verify in database
    const graph = await prisma.graph.findUnique({
      where: { id: graphId },
      include: { nodes: true, edges: true },
    });

    if (!graph) {
      throw new Error('Graph not found in database');
    }

    log(`✓ Graph in database: ${graph.nodes.length} nodes, ${graph.edges.length} edges`, 'green');

    const duration = Date.now() - startTime;
    results.push({
      stage: 'Graph Generation',
      passed: true,
      message: `Created ${nodeCount} nodes`,
      duration,
      data: { graphId, nodeCount },
    });

    return { graphId, nodeCount };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    results.push({
      stage: 'Graph Generation',
      passed: false,
      message: `Failed: ${message}`,
      duration,
    });

    throw error;
  }
}

/**
 * Test Stage 3: Document References Validation
 */
async function testDocumentRefs(graphId: string): Promise<{ refsPopulated: number; crossPage: number }> {
  logStage('Stage 3: Document References Validation');

  const startTime = Date.now();

  try {
    // Fetch nodes from database
    const nodes = await prisma.node.findMany({
      where: { graphId },
    });

    log(`Checking ${nodes.length} nodes for documentRefs...`, 'blue');

    let refsPopulated = 0;
    let crossPageCount = 0;
    const sampleRefs: any[] = [];

    for (const node of nodes) {
      if (node.documentRefs && typeof node.documentRefs === 'object') {
        const refs = node.documentRefs as any;

        if (refs.references && Array.isArray(refs.references) && refs.references.length > 0) {
          refsPopulated++;

          // Check for cross-page references
          for (const ref of refs.references) {
            if (ref.pages && Array.isArray(ref.pages) && ref.pages.length > 1) {
              crossPageCount++;
            }

            // Collect sample
            if (sampleRefs.length < 3) {
              sampleRefs.push({
                nodeTitle: node.title,
                text: ref.text?.substring(0, 60) + '...',
                page: ref.page || ref.pages?.[0],
                hasCoordinates: !!(ref.bbox || ref.coordinates),
              });
            }
          }
        }
      }
    }

    const percentage = ((refsPopulated / nodes.length) * 100).toFixed(1);
    log(`✓ DocumentRefs populated: ${refsPopulated}/${nodes.length} (${percentage}%)`, 'green');

    if (crossPageCount > 0) {
      log(`✓ Cross-page references found: ${crossPageCount}`, 'green');
    }

    // Display samples
    if (sampleRefs.length > 0) {
      log('\nSample references:', 'yellow');
      sampleRefs.forEach((sample, i) => {
        log(`  ${i + 1}. "${sample.nodeTitle}"`, 'blue');
        log(`     Text: "${sample.text}"`, 'blue');
        log(`     Page: ${sample.page}, Coordinates: ${sample.hasCoordinates ? 'Yes' : 'No'}`, 'blue');
      });
    }

    if (refsPopulated === 0) {
      throw new Error('No documentRefs populated - integration likely failed');
    }

    const duration = Date.now() - startTime;
    results.push({
      stage: 'Document Refs',
      passed: true,
      message: `${refsPopulated}/${nodes.length} nodes have refs (${percentage}%)`,
      duration,
      data: { refsPopulated, crossPage: crossPageCount },
    });

    return { refsPopulated, crossPage: crossPageCount };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    results.push({
      stage: 'Document Refs',
      passed: false,
      message: `Failed: ${message}`,
      duration,
    });

    throw error;
  }
}

/**
 * Test Stage 4: API Response Validation
 */
async function testAPIResponse(graphId: string): Promise<void> {
  logStage('Stage 4: API Response Validation (Frontend Contract)');

  const startTime = Date.now();

  try {
    log('Fetching graph via API...', 'blue');
    const response = await axios.get(`${API_BASE_URL}/api/v1/graphs/${graphId}`);

    if (!response.data.success) {
      throw new Error('API request failed: ' + JSON.stringify(response.data.error));
    }

    const graph = response.data.data;

    // Validate structure
    if (!graph.nodes || !Array.isArray(graph.nodes)) {
      throw new Error('Invalid API response: nodes array missing');
    }

    log(`✓ API returns ${graph.nodes.length} nodes`, 'green');

    // Check node structure
    const sampleNode = graph.nodes[0];
    const requiredFields = ['id', 'title', 'nodeType', 'summary'];
    const missingFields = requiredFields.filter(field => !(field in sampleNode));

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    log(`✓ Node structure valid`, 'green');

    // Check documentRefs format
    let nodesWithRefs = 0;
    let validRefsFormat = 0;

    for (const node of graph.nodes) {
      if (node.documentRefs && node.documentRefs.references) {
        nodesWithRefs++;

        const ref = node.documentRefs.references[0];
        if (ref.text && (ref.page !== undefined || ref.pages !== undefined)) {
          if ((ref.bbox || ref.coordinates)) {
            validRefsFormat++;
          }
        }
      }
    }

    log(`✓ Nodes with documentRefs: ${nodesWithRefs}`, 'green');
    log(`✓ Valid ref format: ${validRefsFormat}`, 'green');

    // Display sample for frontend verification
    if (nodesWithRefs > 0) {
      const nodeWithRefs = graph.nodes.find((n: any) => n.documentRefs?.references?.length > 0);
      log('\nSample for frontend:', 'yellow');
      log(JSON.stringify(nodeWithRefs.documentRefs, null, 2), 'blue');
    }

    const duration = Date.now() - startTime;
    results.push({
      stage: 'API Response',
      passed: true,
      message: `Valid structure, ${nodesWithRefs} nodes have refs`,
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    results.push({
      stage: 'API Response',
      passed: false,
      message: `Failed: ${message}`,
      duration,
    });

    throw error;
  }
}

/**
 * Test Stage 5: Cleanup
 */
async function testCleanup(documentId?: string, graphId?: string): Promise<void> {
  logStage('Stage 5: Cleanup');

  const startTime = Date.now();

  try {
    if (graphId) {
      // Delete nodes and edges (cascade)
      await prisma.node.deleteMany({ where: { graphId } });
      await prisma.edge.deleteMany({ where: { graphId } });
      await prisma.graph.delete({ where: { id: graphId } });
      log(`✓ Deleted graph: ${graphId}`, 'green');
    }

    if (documentId) {
      await prisma.document.delete({ where: { id: documentId } });
      log(`✓ Deleted document: ${documentId}`, 'green');
    }

    const duration = Date.now() - startTime;
    results.push({
      stage: 'Cleanup',
      passed: true,
      message: 'Test data removed',
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    results.push({
      stage: 'Cleanup',
      passed: false,
      message: `Failed: ${message}`,
      duration,
    });

    // Don't throw - cleanup is best effort
    log(`Warning: Cleanup incomplete - ${message}`, 'yellow');
  }
}

/**
 * Print summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(60));
  log('TEST SUMMARY', 'cyan');
  console.log('='.repeat(60) + '\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);

  results.forEach(logResult);

  console.log('\n' + '='.repeat(60));
  const summaryColor = passed === total ? 'green' : 'red';
  log(`Result: ${passed}/${total} stages passed (${percentage}%)`, summaryColor);

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  log(`Total time: ${(totalDuration / 1000).toFixed(2)}s`, 'blue');
  console.log('='.repeat(60) + '\n');

  return passed === total;
}

/**
 * Main test runner
 */
async function main() {
  log('\n🚀 Starting Integration Test', 'cyan');
  log(`API: ${API_BASE_URL}`, 'blue');
  log(`PDF: ${TEST_PDF_PATH}\n`, 'blue');

  let documentId: string | undefined;
  let graphId: string | undefined;

  try {
    // Stage 1: Upload PDF
    const uploadResult = await testPDFUpload();
    documentId = uploadResult.documentId;

    // Stage 2: Generate Graph
    const graphResult = await testGraphGeneration(documentId);
    graphId = graphResult.graphId;

    // Stage 3: Validate Document Refs
    await testDocumentRefs(graphId);

    // Stage 4: Validate API Response
    await testAPIResponse(graphId);

  } catch (error) {
    log('\n❌ Test pipeline failed', 'red');
    log(`Error: ${error instanceof Error ? error.message : String(error)}`, 'red');
  } finally {
    // Stage 5: Cleanup (always run)
    await testCleanup(documentId, graphId);

    // Print summary
    const success = printSummary();

    await prisma.$disconnect();

    process.exit(success ? 0 : 1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main as runIntegrationTest };
