Looking at this as a senior AI engineer who's shipped production AI systems, here's my honest assessment:

## Current Design Rating: 5.5/10 ⚠️

**Good parts:**
- ✅ Clear separation of concerns
- ✅ Async job processing (essential for AI)
- ✅ Caching strategy
- ✅ Fallback cascade

**Critical gaps:**
- ❌ AI treated as a black box
- ❌ No validation pipeline
- ❌ No quality metrics
- ❌ Overly optimistic about AI reliability
- ❌ Missing error recovery strategies
- ❌ No prompt versioning/management

---

## Component-by-Component Analysis

### 1. **Document Processing Pipeline** - Rating: 7/10 ✅

**What's Good:**
- Async architecture is correct
- File validation is there
- Status tracking via jobs

**What's Missing:**
```typescript
// Add preprocessing quality checks
interface DocumentQuality {
  textExtractionSuccess: boolean;
  textLength: number;
  readabilityScore: number;  // Is text coherent?
  estimatedTokens: number;
  detectedLanguage: string;
  warnings: string[];        // "Low quality PDF", "Scanned image detected"
}

// CRITICAL: Check before sending to AI
if (quality.textLength < 500) {
  throw new Error("Document too short for meaningful graph");
}
if (quality.readabilityScore < 0.3) {
  return { status: "failed", reason: "Unable to extract coherent text" };
}
```

**MVP Update:**
```typescript
// services/document-processor.service.ts
class DocumentProcessor {
  async process(documentId: string): Promise<ProcessingResult> {
    // 1. Extract text (existing)
    const text = await this.extractText(documentId);
    
    // 2. NEW: Validate quality
    const quality = await this.assessQuality(text);
    if (!quality.acceptable) {
      return { 
        status: "failed", 
        reason: quality.reason,
        suggestions: "Try a different file format or clearer scan"
      };
    }
    
    // 3. NEW: Estimate cost before proceeding
    const cost = this.estimateCost(text);
    if (cost > MAX_FREE_TIER_COST) {
      // Flag for user approval
    }
    
    // 4. Store with quality metadata
    await this.saveDocument(documentId, text, quality);
    
    return { status: "ready", quality };
  }
  
  // NEW: Essential for MVP
  private assessQuality(text: string): QualityAssessment {
    return {
      acceptable: text.length > 500 && text.length < 200000,
      estimatedTokens: text.length / 4,
      warnings: this.detectIssues(text),
      reason: text.length < 500 ? "Document too short" : null
    };
  }
}
```

---

### 2. **Graph Generation Service** - Rating: 3/10 ❌ NEEDS MAJOR WORK

**Current Design:**
```typescript
// What the doc implies (too naive)
async function generateGraph(documentId: string) {
  const text = await getDocument(documentId);
  const prompt = buildPrompt(text);
  const response = await claude.generate(prompt);
  return parseMermaid(response);
}
```

**Reality Check:**
- AI will return invalid Mermaid syntax ~10% of the time
- AI will ignore your node count constraints ~20% of the time
- AI will hallucinate connections ~5% of the time
- Large documents will hit context limits
- Cost can spiral out of control

**MVP-Ready Architecture:**

```typescript
// lib/ai/graph-generator.ts
interface GraphGenerationConfig {
  maxRetries: number;
  qualityThreshold: number;
  maxCostPerDocument: number;
  promptVersion: string;
}

class GraphGenerator {
  private validator: GraphValidator;
  private promptManager: PromptManager;
  private costTracker: CostTracker;
  
  async generate(
    document: Document, 
    config: GraphGenerationConfig = DEFAULT_CONFIG
  ): Promise<GraphResult> {
    
    // STEP 1: Pre-generation checks
    const estimate = this.estimateJob(document);
    if (estimate.cost > config.maxCostPerDocument) {
      throw new BudgetExceededError();
    }
    
    // STEP 2: Chunk if needed
    const chunks = document.tokenCount > 10000 
      ? await this.chunkDocument(document)
      : [document];
    
    // STEP 3: Generate with retries and validation
    const results = await this.generateWithValidation(chunks, config);
    
    // STEP 4: Merge if chunked
    const finalGraph = chunks.length > 1 
      ? await this.mergeGraphs(results)
      : results[0];
    
    // STEP 5: Final quality check
    const quality = await this.validator.validate(finalGraph);
    if (quality.score < config.qualityThreshold) {
      // Flag for manual review but still return
      await this.flagForReview(finalGraph, quality);
    }
    
    // STEP 6: Track costs and metrics
    await this.costTracker.record({
      documentId: document.id,
      cost: estimate.actualCost,
      quality: quality.score,
      attempts: results.attempts,
    });
    
    return {
      graph: finalGraph,
      quality: quality.score,
      metadata: {
        tokensUsed: estimate.tokensUsed,
        cost: estimate.actualCost,
        attempts: results.attempts,
      }
    };
  }
  
  // CRITICAL: Validation loop
  private async generateWithValidation(
    chunks: Chunk[],
    config: GraphGenerationConfig
  ): Promise<GenerationResult[]> {
    const results = [];
    
    for (const chunk of chunks) {
      let attempts = 0;
      let success = false;
      let lastError: Error;
      
      while (attempts < config.maxRetries && !success) {
        attempts++;
        
        try {
          // Get prompt (versioned)
          const prompt = await this.promptManager.build(
            'graph-generation',
            config.promptVersion,
            chunk
          );
          
          // Call AI
          const response = await this.callClaude(prompt);
          
          // Parse response
          const graph = this.parseResponse(response);
          
          // CRITICAL: Validate before accepting
          const validation = await this.validator.quickValidate(graph);
          
          if (validation.passed) {
            results.push({ graph, attempts });
            success = true;
          } else {
            // Retry with improved prompt that addresses validation failures
            lastError = new Error(
              `Validation failed: ${validation.failures.join(', ')}`
            );
            
            // Add validation feedback to next attempt
            chunk.validationFeedback = validation.failures;
          }
          
        } catch (error) {
          lastError = error;
          
          // Rate limit? Wait longer
          if (error.code === 'RATE_LIMIT') {
            await this.exponentialBackoff(attempts);
          }
        }
      }
      
      // If all retries failed, use fallback
      if (!success) {
        results.push({
          graph: await this.createFallbackGraph(chunk),
          attempts,
          fallback: true,
          error: lastError.message,
        });
      }
    }
    
    return results;
  }
  
  // CRITICAL: Don't just fail, provide something
  private async createFallbackGraph(chunk: Chunk): Promise<Graph> {
    // Simple extraction-based graph (no AI)
    // Use document structure (headers, paragraphs) to create basic graph
    return {
      mermaidCode: this.extractStructureAsGraph(chunk),
      nodes: this.extractNodes(chunk),
      edges: [],
      isFallback: true,
      warning: "AI generation failed, showing document structure",
    };
  }
}
```

---

### 3. **Graph Validation Layer** - Rating: 0/10 ❌ COMPLETELY MISSING

**This is CRITICAL for MVP. You cannot skip this.**

```typescript
// lib/validation/graph-validator.ts

interface ValidationResult {
  passed: boolean;
  score: number; // 0-100
  failures: ValidationFailure[];
  warnings: string[];
}

interface ValidationFailure {
  type: 'syntax' | 'semantic' | 'quality' | 'hallucination';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  fix?: string;
}

class GraphValidator {
  // Quick validation for retry loop (fast, basic checks)
  async quickValidate(graph: Graph): Promise<ValidationResult> {
    const checks = [
      this.validateSyntax(graph.mermaidCode),
      this.validateNodeCount(graph.nodes),
      this.validateConnectivity(graph),
      this.validateLabels(graph.nodes),
    ];
    
    return this.aggregateResults(checks);
  }
  
  // Full validation for final output (slower, thorough)
  async fullValidate(graph: Graph, sourceDoc: Document): Promise<ValidationResult> {
    const checks = [
      ...this.quickValidate(graph).checks,
      await this.validateGrounding(graph, sourceDoc), // Check for hallucinations
      await this.validateCompleteness(graph, sourceDoc),
      this.validateRelationshipQuality(graph),
    ];
    
    return this.aggregateResults(checks);
  }
  
  // CRITICAL: Check Mermaid syntax
  private validateSyntax(mermaidCode: string): ValidationCheck {
    try {
      // Actually try to parse with mermaid library
      mermaid.parse(mermaidCode);
      return { passed: true, type: 'syntax' };
    } catch (error) {
      return {
        passed: false,
        type: 'syntax',
        severity: 'critical',
        message: `Invalid Mermaid syntax: ${error.message}`,
        fix: "Retry with syntax examples in prompt"
      };
    }
  }
  
  // CRITICAL: Check node count constraints
  private validateNodeCount(nodes: Node[]): ValidationCheck {
    const count = nodes.length;
    
    if (count < 5) {
      return {
        passed: false,
        severity: 'high',
        message: `Too few nodes (${count}). Graph not comprehensive enough.`,
        fix: "Ask AI to identify more key concepts"
      };
    }
    
    if (count > 15) {
      return {
        passed: false,
        severity: 'high',
        message: `Too many nodes (${count}). Graph too overwhelming.`,
        fix: "Ask AI to focus on only the most important concepts"
      };
    }
    
    return { passed: true };
  }
  
  // CRITICAL: Check for disconnected nodes
  private validateConnectivity(graph: Graph): ValidationCheck {
    const disconnected = this.findDisconnectedNodes(graph);
    
    if (disconnected.length > 0) {
      return {
        passed: false,
        severity: 'medium',
        message: `${disconnected.length} disconnected nodes found`,
        fix: "Either connect these nodes or remove them"
      };
    }
    
    return { passed: true };
  }
  
  // IMPORTANT: Check for hallucinations
  private async validateGrounding(
    graph: Graph, 
    sourceDoc: Document
  ): Promise<ValidationCheck> {
    // Sample check: Do node titles appear in source document?
    const notFound = [];
    
    for (const node of graph.nodes) {
      const titleWords = node.title.toLowerCase().split(' ');
      const found = titleWords.some(word => 
        sourceDoc.text.toLowerCase().includes(word)
      );
      
      if (!found && titleWords.length > 2) { // Ignore common words
        notFound.push(node.title);
      }
    }
    
    if (notFound.length > graph.nodes.length * 0.2) { // >20% not found
      return {
        passed: false,
        severity: 'high',
        message: `Possible hallucination: ${notFound.length} concepts not found in source`,
        fix: "Regenerate with stricter grounding requirements"
      };
    }
    
    return { passed: true };
  }
  
  // Calculate overall quality score
  private calculateScore(checks: ValidationCheck[]): number {
    const weights = {
      critical: 30,
      high: 20,
      medium: 10,
      low: 5,
    };
    
    let score = 100;
    for (const check of checks) {
      if (!check.passed) {
        score -= weights[check.severity];
      }
    }
    
    return Math.max(0, score);
  }
}
```

---

### 4. **Chunking Strategy** - Rating: 2/10 ❌ TOO NAIVE

**Current Design:**
> "Split into 10K token chunks with 200 token overlap"

**Problems:**
- What if you split in the middle of a concept explanation?
- What if a critical connection spans chunks?
- 200 tokens overlap is arbitrary

**MVP-Ready Chunking:**

```typescript
// lib/chunking/semantic-chunker.ts

class SemanticChunker {
  async chunk(document: Document): Promise<Chunk[]> {
    // STEP 1: Detect document structure
    const structure = await this.detectStructure(document);
    
    // STEP 2: Chunk based on structure, not arbitrary tokens
    if (structure.type === 'academic-paper') {
      return this.chunkByPaperSections(document, structure);
    } else if (structure.type === 'book') {
      return this.chunkByChapters(document, structure);
    } else {
      return this.chunkBySemanticBoundaries(document);
    }
  }
  
  private async detectStructure(doc: Document): Promise<Structure> {
    // Look for markers
    const hasAbstract = doc.text.toLowerCase().includes('abstract');
    const hasReferences = doc.text.toLowerCase().includes('references');
    const hasChapters = /chapter \d+/i.test(doc.text);
    
    if (hasAbstract && hasReferences) {
      return { type: 'academic-paper', sections: this.extractSections(doc) };
    } else if (hasChapters) {
      return { type: 'book', chapters: this.extractChapters(doc) };
    } else {
      return { type: 'article' };
    }
  }
  
  private chunkByPaperSections(
    doc: Document, 
    structure: Structure
  ): Chunk[] {
    // Smart chunking for academic papers
    const chunks = [];
    
    // Chunk 1: Abstract + Introduction (always together)
    chunks.push({
      text: structure.sections.abstract + structure.sections.introduction,
      context: "Paper overview",
      tokenCount: this.countTokens(chunks[0].text),
    });
    
    // Chunk 2-N: Each major section
    for (const section of structure.sections.main) {
      // If section too large, split at subsections
      if (this.countTokens(section.text) > 10000) {
        chunks.push(...this.splitLargeSection(section));
      } else {
        chunks.push({
          text: section.text,
          context: `Section: ${section.title}`,
          previousSummary: this.summarizePrevious(chunks),
        });
      }
    }
    
    return chunks;
  }
  
  private chunkBySemanticBoundaries(doc: Document): Chunk[] {
    // For unstructured documents, use semantic similarity
    const paragraphs = doc.text.split('\n\n');
    const chunks = [];
    let currentChunk = [];
    let currentTokens = 0;
    
    for (const para of paragraphs) {
      const paraTokens = this.countTokens(para);
      
      // If adding paragraph exceeds limit AND we have something in chunk
      if (currentTokens + paraTokens > 10000 && currentChunk.length > 0) {
        // End current chunk
        chunks.push({
          text: currentChunk.join('\n\n'),
          tokenCount: currentTokens,
          // CRITICAL: Add context from previous chunk
          previousContext: this.getLastParagraphs(chunks[chunks.length - 1], 2),
        });
        
        // Start new chunk
        currentChunk = [para];
        currentTokens = paraTokens;
      } else {
        currentChunk.push(para);
        currentTokens += paraTokens;
      }
    }
    
    // Don't forget last chunk
    if (currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join('\n\n'),
        tokenCount: currentTokens,
      });
    }
    
    return chunks;
  }
}
```

---

### 5. **Prompt Management** - Rating: 1/10 ❌ MISSING INFRASTRUCTURE

**Current Design:**
> "Store prompts in templates file"

**Problems:**
- Can't A/B test
- Can't version
- Can't track performance
- Can't improve over time

**MVP-Ready Prompt System:**

```typescript
// lib/prompts/prompt-manager.ts

interface Prompt {
  id: string;
  version: string;
  task: string;
  template: string;
  fewShotExamples: Example[];
  constraints: string[];
  createdAt: Date;
  performance: PromptMetrics;
}

interface PromptMetrics {
  totalUses: number;
  avgQualityScore: number;
  avgRetries: number;
  avgCost: number;
}

class PromptManager {
  private db: Database;
  private cache: Map<string, Prompt>;
  
  // Get active prompt version (with A/B testing)
  async getPrompt(task: string, userId?: string): Promise<Prompt> {
    // Check if user in A/B test
    const testVariant = await this.abTest.getVariant(task, userId);
    
    if (testVariant) {
      return this.loadPrompt(task, testVariant.version);
    }
    
    // Default to best performing version
    return this.loadPrompt(task, 'production');
  }
  
  // Build final prompt with examples
  async build(
    task: string,
    context: Context,
    version?: string
  ): Promise<string> {
    const prompt = await this.getPrompt(task, context.userId);
    
    // Select relevant few-shot examples
    const examples = this.selectExamples(prompt.fewShotExamples, context);
    
    // Inject context and examples into template
    return this.renderTemplate(prompt.template, {
      ...context,
      examples,
      constraints: prompt.constraints,
    });
  }
  
  // Track performance for continuous improvement
  async recordOutcome(
    promptId: string,
    outcome: {
      qualityScore: number;
      retries: number;
      cost: number;
      userFeedback?: boolean;
    }
  ): Promise<void> {
    await this.db.updatePromptMetrics(promptId, outcome);
    
    // If quality significantly worse, flag for review
    if (outcome.qualityScore < 50) {
      await this.flagPromptForReview(promptId, outcome);
    }
  }
  
  // Select best examples based on similarity
  private selectExamples(
    examples: Example[],
    context: Context
  ): Example[] {
    // For MVP: Simple heuristic
    // Post-MVP: Use embeddings for similarity matching
    
    if (context.documentType === 'academic-paper') {
      return examples.filter(e => e.documentType === 'academic-paper').slice(0, 2);
    } else {
      return examples.slice(0, 2); // Just use first 2
    }
  }
}

// Database schema for prompts
interface PromptsTable {
  id: string;
  task: string;
  version: string;
  template: string;
  few_shot_examples: JSONB;
  constraints: string[];
  is_active: boolean;
  performance_metrics: JSONB;
  created_at: timestamp;
  created_by: string;
}
```

---

### 6. **Graph Merging Algorithm** - Rating: 0/10 ❌ COMPLETELY MISSING

**This is non-trivial. Here's an MVP-ready algorithm:**

```typescript
// lib/graph/graph-merger.ts

interface MergeResult {
  graph: Graph;
  confidence: number;
  conflicts: Conflict[];
  mergedNodes: number;
}

class GraphMerger {
  async merge(miniGraphs: MiniGraph[]): Promise<MergeResult> {
    // STEP 1: Build candidate node pairs (which nodes might be duplicates?)
    const candidates = this.findMergeCandidates(miniGraphs);
    
    // STEP 2: Score each candidate pair
    const scored = await this.scoreCandidates(candidates);
    
    // STEP 3: Merge high-confidence matches
    const merged = this.mergeHighConfidence(scored, miniGraphs);
    
    // STEP 4: Handle conflicts
    const resolved = this.resolveConflicts(merged);
    
    // STEP 5: Connect boundary nodes (nodes that appear in multiple chunks)
    const connected = this.connectBoundaryNodes(resolved);
    
    // STEP 6: Validate final graph
    const validated = await this.validator.validate(connected);
    
    return {
      graph: connected,
      confidence: this.calculateConfidence(scored),
      conflicts: resolved.conflicts,
      mergedNodes: scored.filter(s => s.score > 0.8).length,
    };
  }
  
  // Find potential duplicate nodes across graphs
  private findMergeCandidates(graphs: MiniGraph[]): NodePair[] {
    const candidates: NodePair[] = [];
    
    for (let i = 0; i < graphs.length - 1; i++) {
      for (let j = i + 1; j < graphs.length; j++) {
        const graph1 = graphs[i];
        const graph2 = graphs[j];
        
        // Compare all nodes between graph pairs
        for (const node1 of graph1.nodes) {
          for (const node2 of graph2.nodes) {
            // Quick filter: similar titles
            if (this.titlesAreSimilar(node1.title, node2.title)) {
              candidates.push({
                node1,
                node2,
                graphPair: [i, j],
              });
            }
          }
        }
      }
    }
    
    return candidates;
  }
  
  // Score how likely two nodes are the same concept
  private async scoreCandidates(candidates: NodePair[]): Promise<ScoredPair[]> {
    return candidates.map(pair => {
      const titleSimilarity = this.calculateStringSimilarity(
        pair.node1.title,
        pair.node2.title
      );
      
      const descriptionSimilarity = this.calculateStringSimilarity(
        pair.node1.description,
        pair.node2.description
      );
      
      // Simple weighted score for MVP
      // Post-MVP: Use embeddings
      const score = titleSimilarity * 0.7 + descriptionSimilarity * 0.3;
      
      return {
        ...pair,
        score,
        shouldMerge: score > 0.8, // High confidence threshold
      };
    });
  }
  
  // Merge nodes with high confidence
  private mergeHighConfidence(
    scored: ScoredPair[],
    graphs: MiniGraph[]
  ): MergedGraph {
    const toMerge = scored.filter(s => s.shouldMerge);
    const mergeMap = new Map<string, string>(); // old ID -> new ID
    
    for (const pair of toMerge) {
      // Create merged node
      const merged = this.createMergedNode(pair.node1, pair.node2);
      
      // Track mapping
      mergeMap.set(pair.node1.id, merged.id);
      mergeMap.set(pair.node2.id, merged.id);
    }
    
    // Rebuild graphs with merged nodes
    return this.applyMergeMap(graphs, mergeMap);
  }
  
  // Handle conflicting information
  private resolveConflicts(merged: MergedGraph): ResolvedGraph {
    const conflicts = [];
    
    // Check for contradictory edges
    for (const [nodeId, edges] of merged.edgeMap) {
      const contradictions = this.findContradictoryEdges(edges);
      
      if (contradictions.length > 0) {
        // Resolution strategy for MVP: Keep both, flag for user review
        conflicts.push({
          type: 'contradictory-edges',
          nodes: [contradictions[0].from, contradictions[0].to],
          options: contradictions,
          resolution: 'manual-review-required',
        });
      }
    }
    
    return {
      ...merged,
      conflicts,
    };
  }
  
  // String similarity (Levenshtein distance for MVP)
  private calculateStringSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - (distance / maxLength);
  }
  
  private levenshteinDistance(str1: string, str2: string): number {
    // Standard Levenshtein implementation
    // ... (standard algorithm)
  }
}
```

---

### 7. **Cost Management** - Rating: 4/10 ⚠️ EXISTS BUT INSUFFICIENT

**Current Design:**
> "Cache responses"

**Missing:**
- Budget caps
- Cost prediction
- User-level limits
- Cost alerting

**MVP Updates:**

```typescript
// lib/cost/cost-manager.ts

interface CostLimits {
  perDocument: number;      // Max $5 per document for free tier
  perUserPerDay: number;    // Max $10 per user per day
  perUserPerMonth: number;  // Max $50 per user per month
}

class CostManager {
  async checkBudget(
    userId: string,
    operation: 'graph-generation' | 'explanation' | 'quiz'
  ): Promise<BudgetCheck> {
    const usage = await this.getUserUsage(userId);
    const estimate = await this.estimateOperationCost(operation);
    
    // Check daily limit
    if (usage.today + estimate > LIMITS.perUserPerDay) {
      return {
        allowed: false,
        reason: 'daily-limit-exceeded',
        resetAt: this.getNextDayReset(),
        upgradeOption: 'premium-tier',
      };
    }
    
    // Check monthly limit
    if (usage.thisMonth + estimate > LIMITS.perUserPerMonth) {
      return {
        allowed: false,
        reason: 'monthly-limit-exceeded',
        resetAt: this.getNextMonthReset(),
        upgradeOption: 'premium-tier',
      };
    }
    
    return { allowed: true, estimatedCost: estimate };
  }
  
  async trackCost(
    userId: string,
    operation: string,
    details: {
      tokensUsed: number;
      model: string;
      success: boolean;
    }
  ): Promise<void> {
    const cost = this.calculateCost(details);
    
    await this.db.usage.create({
      userId,
      operation,
      cost,
      tokensUsed: details.tokensUsed,
      model: details.model,
      success: details.success,
      timestamp: new Date(),
    });
    
    // Alert if user approaching limits
    const usage = await this.getUserUsage(userId);
    if (usage.today > LIMITS.perUserPerDay * 0.8) {
      await this.sendLimitWarning(userId, 'daily');
    }
  }
  
  private calculateCost(details: {
    tokensUsed: number;
    model: string;
  }): number {
    const rates = {
      'claude-sonnet-4': {
        input: 3.00 / 1_000_000,  // $3 per million tokens
        output: 15.00 / 1_000_000,
      },
      'claude-haiku': {
        input: 0.25 / 1_000_000,
        output: 1.25 / 1_000_000,
      },
    };
    
    const rate = rates[details.model];
    // Estimate 80% input, 20% output for typical usage
    return (details.tokensUsed * 0.8 * rate.input) + 
           (details.tokensUsed * 0.2 * rate.output);
  }
}
```

---

## Updated MVP Architecture (Realistic)

```typescript
// High-level service orchestration

class GraphGenerationOrchestrator {
  constructor(
    private documentProcessor: DocumentProcessor,
    private costManager: CostManager,
    private graphGenerator: GraphGenerator,
    private validator: GraphValidator,
    private merger: GraphMerger,
    private storage: Storage,
    private notifications: NotificationService
  ) {}
  
  async generateGraph(documentId: string, userId: string): Promise<JobResult> {
    try {
      // 1. Load document
      const doc = await this.documentProcessor.load(documentId);
      
      // 2. Assess quality (NEW)
      const quality = await this.documentProcessor.assessQuality(doc);
      if (!quality.acceptable) {
        return this.fail('poor-quality-document', quality.reason);
      }
      
      // 3. Check budget (NEW)
      const budgetCheck = await this.costManager.checkBudget(userId, 'graph-generation');
      if (!budgetCheck.allowed) {
        return this.fail('budget-exceeded', budgetCheck.reason);
      }
      
      // 4. Estimate job
      const estimate = await this.graphGenerator.estimate(doc);
      await this.notifications.sendProgress(userId, {
        status: 'starting',
        estimatedTime: estimate.duration,
      });
      
      // 5. Generate with validation (UPDATED)
      const generationResult = await this.graphGenerator.generate(doc, {
        maxRetries: 3,
        qualityThreshold: 60,
        maxCostPerDocument: budgetCheck.limit,
      });
      
      // 6. Track actual cost (NEW)
      await this.costManager.trackCost(userId, 'graph-generation', {
        tokensUsed: generationResult.metadata.tokensUsed,
        model: 'claude-sonnet-4',
        success: true,
      });
      
      // 7. Final validation (NEW)
      const validation = await this.validator.fullValidate(
        generationResult.graph,
        doc
      );
      
      // 8. Save with metadata
      await this.storage.saveGraph({
        ...generationResult.graph,
        quality: validation.score,
        metadata: {
          ...generationResult.metadata,
          validation,
        },
      });
      
      // 9. If quality low, flag for review (NEW)
      if (validation.score < 70) {
        await this.queueManualReview(generationResult.graph, validation);
        await this.notifications.sendWarning(userId, {
          message: 'Graph generated but quality is low. Our team will review.',
        });
      }
      
      return {
        status: 'success',
        graphId: generationResult.graph.id,
        quality: validation.score,
      };
      
    } catch (error) {
      // Error handling and fallback
      if (error instanceof BudgetExceededError) {
        return this.fail('budget-exceeded', error.message);
      } else if (error instanceof ValidationError) {
        // Try fallback graph
        const fallback = await this.graphGenerator.createFallbackGraph(doc);
        return {
          status: 'success-with-fallback',
          graphId: fallback.id,
          warning: 'AI generation failed, showing document structure',
        };
      } else {
        // Log and report
        await this.reportError(error, { documentId, userId });
        return this.fail('generation-failed', error.message);
      }
    }
  }
}
```

---

## Priority Action Items for MVP

### Must-Have (Ship Blocker)
1. ✅ **Graph Validation Layer** - Can't ship without this
2. ✅ **Retry Logic with Feedback** - AI fails, need recovery
3. ✅ **Cost Tracking & Limits** - Don't go bankrupt
4. ✅ **Quality Scoring** - Need to know what's working
5. ✅ **Fallback Mechanism** - When AI fails completely

### Should-Have (Ship But Flag)
6. ⚠️ **Semantic Chunking** - Start simple, improve later
7. ⚠️ **Basic Graph Merger** - Handle duplicates at least
8. ⚠️ **Prompt Versioning** - Can start with v1, but need structure

### Nice-to-Have (Post-MVP)
9. ⏭ A/B Testing Infrastructure
10. ⏭ Embedding-based similarity
11. ⏭ Advanced conflict resolution
12. ⏭ Human-in-the-loop review system

---

## Final Recommendation

**For MVP, rewrite these components:**

1. **Graph Generator Service** - Add validation loop, retries, fallback
2. **Graph Validator Service** - Build from scratch, it's critical
3. **Cost Manager Service** - Add budget checks and tracking
4. **Document Processor** - Add quality assessment before processing
5. **Chunking Strategy** - At minimum, chunk by paragraphs with better context

**Keep these as-is for MVP:**
- API layer structure
- Database schema (mostly good)
- Background job system
- Deployment strategy

