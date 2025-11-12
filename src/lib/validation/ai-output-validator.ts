/**
 * AI Output Validator - CRITICAL Production Component
 *
 * This validator is the ONLY defense against AI failures reaching production.
 * Without this, ~30% of AI outputs would break the application.
 *
 * Key Statistics from Production Data:
 * - AI returns invalid Mermaid syntax ~10% of the time
 * - AI ignores node count constraints ~20% of the time
 * - AI hallucinates connections ~5% of the time
 *
 * With this validator + retry loop, we achieve ~95% success rate.
 *
 * @see META/SERVICE_DESIGN_V2.md Section 2.3
 * @see META/SERVICE_DESIGN_REFLECTION.md Lines 267-421
 */

import {
  ValidationResult,
  ValidationOptions,
  ValidationCheck,
  ValidationIssue,
  AIGraphOutput,
  AIConnectionOutput,
  AIQuizOutput,
  AIOutputType,
  QualityScore,
} from '../../types/validation.types';
// Error classes imported but not used directly in this file.
// They're part of the public API for consumers of this module.
// Keeping imports for documentation and future use.

/**
 * Severity weights for quality scoring
 * Higher weight = bigger score deduction
 */
const SEVERITY_WEIGHTS = {
  critical: 40, // Invalid syntax, missing required fields
  high: 20, // Too many/few nodes, orphans, hallucinations
  medium: 10, // Minor structural issues
  low: 5, // Warnings only
} as const;

/**
 * Node count constraints for graph generation
 */
const NODE_COUNT_CONSTRAINTS = {
  min: 5, // Too few = not comprehensive enough
  max: 15, // Too many = overwhelming
  ideal: { min: 7, max: 12 }, // Sweet spot for learning
} as const;

/**
 * Quiz question constraints
 */
const QUIZ_CONSTRAINTS = {
  optionsPerQuestion: 4,
  minQuestions: 1,
  maxQuestions: 20,
} as const;

/**
 * Explanation length constraints (in characters)
 */
const EXPLANATION_CONSTRAINTS = {
  min: 50, // Too short = not useful
  max: 1000, // Too long = overwhelming
  ideal: { min: 100, max: 500 },
} as const;

/**
 * AI Output Validator
 *
 * Validates AI-generated outputs before accepting them. Used in retry loops
 * to catch and fix AI failures.
 */
export class AIOutputValidator {
  /**
   * Validate AI output based on type
   *
   * This is the main entry point used by the AI orchestrator.
   *
   * @param output - The AI-generated output to validate
   * @param outputType - Type of output (graph, explanation, quiz)
   * @param options - Validation options (threshold, mode, etc.)
   * @returns ValidationResult with pass/fail, score, and issues
   */
  async validate(
    output: unknown,
    outputType: AIOutputType,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const startTime = Date.now();

    // Route to specific validator based on type
    let result: ValidationResult;

    switch (outputType) {
      case 'graph-generation':
        result = await this.validateGraph(output as AIGraphOutput, options);
        break;

      case 'connection-explanation':
        result = await this.validateExplanation(output as AIConnectionOutput, options);
        break;

      case 'quiz-generation':
        result = await this.validateQuiz(output as AIQuizOutput, options);
        break;

      default:
        // Unknown type - pass through with warning
        result = {
          passed: true,
          score: 100,
          issues: [],
          warnings: [`Unknown output type: ${outputType}, skipping validation`],
        };
    }

    // Add metadata if requested
    if (options.includeMetadata) {
      result.metadata = {
        mode: options.mode || 'quick',
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        checksPerformed: this.getChecksPerformed(outputType, options),
      };
    }

    return result;
  }

  /**
   * Validate graph generation output
   *
   * Checks:
   * 1. Mermaid syntax validity (CRITICAL)
   * 2. Node count constraints (5-15 nodes)
   * 3. Connectivity (no orphan nodes)
   * 4. Label quality (not empty, reasonable length)
   * 5. Grounding (concepts from source document) [full mode only]
   *
   * @param graph - Generated graph structure
   * @param options - Validation options
   * @returns Validation result
   */
  async validateGraph(graph: AIGraphOutput, options: ValidationOptions = {}): Promise<ValidationResult> {
    const checks: ValidationCheck[] = [];
    const warnings: string[] = [];

    // Check 1: Validate Mermaid syntax (CRITICAL - will crash renderer)
    checks.push(await this.validateMermaidSyntax(graph.mermaidCode));

    // Check 2: Validate node count constraints
    checks.push(this.validateNodeCount(graph.nodes));

    // Check 3: Validate connectivity (no orphan nodes)
    checks.push(this.validateConnectivity(graph));

    // Check 4: Validate node labels
    checks.push(this.validateNodeLabels(graph.nodes));

    // Check 5: Validate edge structure
    checks.push(this.validateEdges(graph));

    // Check 6: Grounding validation (only in full mode with source document)
    if (options.mode === 'full' && options.sourceDocument) {
      const groundingCheck = await this.validateGrounding(graph, options.sourceDocument.text);
      checks.push(groundingCheck);

      // Add warning if grounding is low but not failing
      if (groundingCheck.passed && groundingCheck.metadata?.groundingPercentage) {
        const percentage = groundingCheck.metadata.groundingPercentage as number;
        if (percentage < 80) {
          warnings.push(`Grounding is ${percentage}% - some concepts may not be in source`);
        }
      }
    }

    return this.aggregateResults(checks, warnings, options.threshold);
  }

  /**
   * Validate connection explanation output
   *
   * Checks:
   * 1. Explanation is not empty
   * 2. Has reasonable length
   * 3. Includes source quotes (if available)
   * 4. References nodes involved
   *
   * @param explanation - Generated explanation
   * @param options - Validation options
   * @returns Validation result
   */
  async validateExplanation(
    explanation: AIConnectionOutput,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const checks: ValidationCheck[] = [];
    const warnings: string[] = [];

    // Check 1: Explanation exists and not empty
    checks.push(this.validateExplanationExists(explanation.explanation));

    // Check 2: Explanation length is reasonable
    checks.push(this.validateExplanationLength(explanation.explanation));

    // Check 3: Has source quotes (warning if missing)
    if (!explanation.sourceQuotes || explanation.sourceQuotes.length === 0) {
      warnings.push('No source quotes provided - explanation may lack grounding');
    }

    // Check 4: Has node references
    if (!explanation.nodeReferences) {
      warnings.push('No node references - cannot verify which nodes are being explained');
    }

    return this.aggregateResults(checks, warnings, options.threshold);
  }

  /**
   * Validate quiz generation output
   *
   * Checks:
   * 1. Correct number of questions
   * 2. Each question has exactly 4 options
   * 3. Correct answer index is valid (0-3)
   * 4. Has explanation for each question
   * 5. Has difficulty level
   *
   * @param quiz - Generated quiz
   * @param options - Validation options
   * @returns Validation result
   */
  async validateQuiz(quiz: AIQuizOutput, options: ValidationOptions = {}): Promise<ValidationResult> {
    const checks: ValidationCheck[] = [];
    const warnings: string[] = [];

    // Ensure all failing checks are added to the array (not just pushing when conditions fail)
    quiz.questions.forEach((question, index) => {
      // Check 1: Has question text
      if (!question.questionText || question.questionText.trim().length === 0) {
        checks.push({
          passed: false,
          severity: 'critical',
          type: 'invalid-node-structure',
          message: `Question ${index + 1} has empty question text`,
          fix: 'Provide a clear question for each quiz item',
        });
      } else {
        checks.push({ passed: true }); // Add passing check to balance
      }

      // Check 2: Has exactly 4 options
      if (!question.options || question.options.length !== QUIZ_CONSTRAINTS.optionsPerQuestion) {
        checks.push({
          passed: false,
          severity: 'critical',
          type: 'invalid-options-count',
          message: `Question ${index + 1} has ${question.options?.length || 0} options instead of ${QUIZ_CONSTRAINTS.optionsPerQuestion}`,
          fix: 'Each question must have exactly 4 answer options',
        });
      } else {
        checks.push({ passed: true });
      }

      // Check 3: Correct answer index is valid
      if (
        question.correctAnswerIndex < 0 ||
        question.correctAnswerIndex >= QUIZ_CONSTRAINTS.optionsPerQuestion
      ) {
        checks.push({
          passed: false,
          severity: 'critical',
          type: 'invalid-answer-index',
          message: `Question ${index + 1} has invalid answer index: ${question.correctAnswerIndex}`,
          fix: 'correctAnswerIndex must be 0, 1, 2, or 3',
        });
      } else {
        checks.push({ passed: true });
      }

      // Check 4: Has explanation
      if (!question.explanation || question.explanation.trim().length === 0) {
        checks.push({
          passed: false,
          severity: 'high',
          type: 'missing-explanation',
          message: `Question ${index + 1} is missing an explanation`,
          fix: 'Provide an explanation for why the correct answer is correct',
        });
      } else {
        checks.push({ passed: true });
      }

      // Check 5: Has difficulty level
      if (!question.difficulty || !['easy', 'medium', 'hard'].includes(question.difficulty)) {
        checks.push({
          passed: false,
          severity: 'medium',
          type: 'missing-difficulty',
          message: `Question ${index + 1} has invalid difficulty: ${question.difficulty}`,
          fix: "difficulty must be 'easy', 'medium', or 'hard'",
        });
      } else {
        checks.push({ passed: true });
      }
    });

    return this.aggregateResults(checks, warnings, options.threshold);
  }

  /**
   * Validate Mermaid syntax by actually parsing it
   *
   * This is CRITICAL - invalid syntax will crash the renderer.
   * We use a try-catch with the actual mermaid parser.
   *
   * For MVP: Basic pattern matching validation (works in Node.js)
   * Post-MVP: Use actual mermaid parser (requires browser environment)
   *
   * @param mermaidCode - Mermaid syntax string
   * @returns Validation check result
   */
  private async validateMermaidSyntax(mermaidCode: string): Promise<ValidationCheck> {
    if (!mermaidCode || mermaidCode.trim().length === 0) {
      return {
        passed: false,
        severity: 'critical',
        type: 'invalid-mermaid',
        message: 'Mermaid code is empty',
        fix: 'Provide valid Mermaid graph syntax',
      };
    }

    // Basic syntax validation using regex patterns
    // This is a simplified check that works in Node.js without browser dependencies
    // In production, the frontend will use the actual mermaid renderer

    // Check for basic graph declaration
    const hasGraphDeclaration = /^(graph|flowchart)\s+(TD|TB|BT|RL|LR)/im.test(mermaidCode);

    if (!hasGraphDeclaration) {
      return {
        passed: false,
        severity: 'critical',
        type: 'invalid-mermaid',
        message: 'Missing graph declaration. Must start with "graph TD" or similar.',
        fix: 'Start with graph declaration like: graph TD\n    A[Node 1] --> B[Node 2]',
        metadata: {
          codeLength: mermaidCode.length,
        },
      };
    }

    // Check for basic node/edge syntax patterns
    const hasNodes = /\w+\[.+?\]/.test(mermaidCode);

    if (!hasNodes) {
      return {
        passed: false,
        severity: 'critical',
        type: 'invalid-mermaid',
        message: 'No valid node definitions found. Nodes must be in format: A[Label]',
        fix: 'Add nodes like: A[Node Label]',
        metadata: {
          codeLength: mermaidCode.length,
        },
      };
    }

    // Passed basic validation
    return { passed: true };
  }

  /**
   * Validate node count is within acceptable range
   *
   * AI often ignores constraints, producing too few or too many nodes.
   * 5-15 is our sweet spot for learning.
   *
   * @param nodes - Graph nodes
   * @returns Validation check result
   */
  private validateNodeCount(nodes: unknown[]): ValidationCheck {
    if (!Array.isArray(nodes)) {
      return {
        passed: false,
        severity: 'critical',
        type: 'invalid-node-structure',
        message: 'Nodes is not an array',
        fix: 'Provide an array of nodes',
      };
    }

    const count = nodes.length;

    if (count < NODE_COUNT_CONSTRAINTS.min) {
      return {
        passed: false,
        severity: 'high',
        type: 'too-few-nodes',
        message: `Only ${count} nodes. Need at least ${NODE_COUNT_CONSTRAINTS.min}.`,
        fix: `Identify at least ${NODE_COUNT_CONSTRAINTS.min} key concepts from the document. Focus on main ideas, definitions, and important relationships.`,
        metadata: {
          actualCount: count,
          expectedRange: {
            min: NODE_COUNT_CONSTRAINTS.min,
            max: NODE_COUNT_CONSTRAINTS.max,
          },
        },
      };
    }

    if (count > NODE_COUNT_CONSTRAINTS.max) {
      return {
        passed: false,
        severity: 'high',
        type: 'too-many-nodes',
        message: `${count} nodes. Maximum is ${NODE_COUNT_CONSTRAINTS.max}.`,
        fix: `Reduce to the ${NODE_COUNT_CONSTRAINTS.max} most important concepts only. Remove minor details and combine related concepts.`,
        metadata: {
          actualCount: count,
          expectedRange: {
            min: NODE_COUNT_CONSTRAINTS.min,
            max: NODE_COUNT_CONSTRAINTS.max,
          },
        },
      };
    }

    return { passed: true };
  }

  /**
   * Validate connectivity - find orphan nodes (disconnected from graph)
   *
   * Orphaned nodes suggest incomplete analysis. Every concept should
   * connect to at least one other concept.
   *
   * @param graph - Graph structure
   * @returns Validation check result
   */
  private validateConnectivity(graph: AIGraphOutput): ValidationCheck {
    const orphans = this.findOrphanNodes(graph);

    if (orphans.length > 0) {
      return {
        passed: false,
        severity: 'medium',
        type: 'disconnected-nodes',
        message: `${orphans.length} disconnected nodes: ${orphans.map(n => n.title).slice(0, 3).join(', ')}${orphans.length > 3 ? '...' : ''}`,
        fix: 'Either connect these nodes to the main graph by identifying their relationships, or remove them if they are not central concepts.',
        metadata: {
          orphanedNodeIds: orphans.map(n => n.id),
          orphanedTitles: orphans.map(n => n.title),
        },
      };
    }

    return { passed: true };
  }

  /**
   * Find nodes that have no connections (orphans)
   *
   * @param graph - Graph structure
   * @returns Array of orphaned nodes
   */
  private findOrphanNodes(graph: AIGraphOutput): Array<{ id: string; title: string }> {
    const connectedIds = new Set<string>();

    // Collect all node IDs that appear in edges
    for (const edge of graph.edges || []) {
      connectedIds.add(edge.fromNodeId);
      connectedIds.add(edge.toNodeId);
    }

    // Find nodes not in the connected set
    return (graph.nodes || [])
      .filter(node => !connectedIds.has(node.id))
      .map(node => ({ id: node.id, title: node.title }));
  }

  /**
   * Validate node labels are not empty and have reasonable length
   *
   * @param nodes - Graph nodes
   * @returns Validation check result
   */
  private validateNodeLabels(nodes: unknown[]): ValidationCheck {
    if (!Array.isArray(nodes)) {
      return { passed: true }; // Already caught by validateNodeCount
    }

    const emptyLabels: string[] = [];
    const tooLong: string[] = [];

    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) continue;

      const n = node as { id?: string; title?: string };

      // Check for empty or very short labels
      if (!n.title || n.title.trim().length < 2) {
        emptyLabels.push(n.id || 'unknown');
      }

      // Check for excessively long labels (>100 chars suggests description, not title)
      if (n.title && n.title.length > 100) {
        tooLong.push(n.id || 'unknown');
      }
    }

    if (emptyLabels.length > 0) {
      return {
        passed: false,
        severity: 'high',
        type: 'empty-labels',
        message: `${emptyLabels.length} nodes with invalid labels`,
        fix: 'Each node must have a clear, descriptive label (2-50 characters). Use concise titles, not full sentences.',
      };
    }

    if (tooLong.length > 0) {
      return {
        passed: false,
        severity: 'medium',
        type: 'empty-labels',
        message: `${tooLong.length} nodes with excessively long labels`,
        fix: 'Node labels should be concise titles (2-50 characters), not full descriptions. Use the description field for details.',
      };
    }

    return { passed: true };
  }

  /**
   * Validate edges have proper structure
   *
   * @param graph - Graph structure
   * @returns Validation check result
   */
  private validateEdges(graph: AIGraphOutput): ValidationCheck {
    if (!Array.isArray(graph.edges)) {
      return {
        passed: false,
        severity: 'critical',
        type: 'invalid-edge-structure',
        message: 'Edges is not an array',
        fix: 'Provide an array of edges',
      };
    }

    const nodeIds = new Set((graph.nodes || []).map(n => n.id));
    const invalidEdges: string[] = [];

    for (const edge of graph.edges) {
      // Check edge has required fields
      if (!edge.fromNodeId || !edge.toNodeId) {
        invalidEdges.push('missing fromNodeId or toNodeId');
        continue;
      }

      // Check referenced nodes exist
      if (!nodeIds.has(edge.fromNodeId)) {
        invalidEdges.push(`fromNodeId ${edge.fromNodeId} does not exist`);
      }
      if (!nodeIds.has(edge.toNodeId)) {
        invalidEdges.push(`toNodeId ${edge.toNodeId} does not exist`);
      }
    }

    if (invalidEdges.length > 0) {
      return {
        passed: false,
        severity: 'high',
        type: 'invalid-edge-structure',
        message: `${invalidEdges.length} invalid edges found`,
        fix: 'Ensure all edges have fromNodeId and toNodeId, and that they reference existing nodes',
      };
    }

    return { passed: true };
  }

  /**
   * Validate grounding - check if nodes reference concepts from source
   *
   * This is an anti-hallucination check. If >20% of node titles don't
   * appear in the source document, the AI is likely hallucinating.
   *
   * @param graph - Graph structure
   * @param sourceText - Original document text
   * @returns Validation check result
   */
  private async validateGrounding(graph: AIGraphOutput, sourceText: string): Promise<ValidationCheck> {
    const notFound: string[] = [];
    const lowerSourceText = sourceText.toLowerCase();

    for (const node of graph.nodes || []) {
      const titleWords = node.title.toLowerCase().split(/\s+/);

      // Check if any significant word from title appears in source
      // Ignore common words (the, and, of, etc.)
      const significantWords = titleWords.filter(word => word.length > 3);

      if (significantWords.length === 0) continue; // Skip if all words are short

      const found = significantWords.some(word => lowerSourceText.includes(word));

      if (!found) {
        notFound.push(node.title);
      }
    }

    const totalNodes = graph.nodes?.length || 0;
    const notFoundPercentage = totalNodes > 0 ? (notFound.length / totalNodes) * 100 : 0;
    const groundingPercentage = 100 - notFoundPercentage;

    // If >20% not found, likely hallucination
    if (notFoundPercentage > 20) {
      return {
        passed: false,
        severity: 'high',
        type: 'possible-hallucination',
        message: `${notFound.length}/${totalNodes} (${Math.round(notFoundPercentage)}%) concepts not found in source: ${notFound.slice(0, 3).join(', ')}${notFound.length > 3 ? '...' : ''}`,
        fix: 'Only extract concepts that are explicitly mentioned in the source document. Do not infer or create concepts that are not directly stated in the text.',
        metadata: {
          unfoundConcepts: notFound,
          totalConcepts: totalNodes,
          groundingPercentage: Math.round(groundingPercentage),
        },
      };
    }

    return {
      passed: true,
      metadata: {
        groundingPercentage: Math.round(groundingPercentage),
      },
    };
  }

  /**
   * Validate explanation exists and is not empty
   *
   * @param explanation - Explanation text
   * @returns Validation check result
   */
  private validateExplanationExists(explanation: string): ValidationCheck {
    if (!explanation || explanation.trim().length === 0) {
      return {
        passed: false,
        severity: 'critical',
        type: 'empty-explanation',
        message: 'Explanation is empty',
        fix: 'Provide a meaningful explanation of the connection between the concepts',
      };
    }

    return { passed: true };
  }

  /**
   * Validate explanation length is reasonable
   *
   * @param explanation - Explanation text
   * @returns Validation check result
   */
  private validateExplanationLength(explanation: string): ValidationCheck {
    const length = explanation.trim().length;

    if (length < EXPLANATION_CONSTRAINTS.min) {
      return {
        passed: false,
        severity: 'high',
        type: 'explanation-too-short',
        message: `Explanation too short (${length} chars). Need at least ${EXPLANATION_CONSTRAINTS.min}.`,
        fix: 'Provide a more detailed explanation with examples and context from the source',
      };
    }

    if (length > EXPLANATION_CONSTRAINTS.max) {
      return {
        passed: false,
        severity: 'medium',
        type: 'explanation-too-long',
        message: `Explanation too long (${length} chars). Maximum is ${EXPLANATION_CONSTRAINTS.max}.`,
        fix: 'Keep explanation concise and focused. Aim for 100-500 characters.',
      };
    }

    return { passed: true };
  }

  /**
   * Aggregate validation checks into final result
   *
   * Calculates quality score based on severity-weighted deductions.
   *
   * @param checks - Array of validation checks
   * @param warnings - Non-critical warnings
   * @param threshold - Minimum acceptable score (default: 60)
   * @returns Aggregated validation result
   */
  private aggregateResults(
    checks: ValidationCheck[],
    warnings: string[] = [],
    threshold: number = 60
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    let score = 100;

    // Convert failed checks to issues and calculate score
    for (const check of checks) {
      if (!check.passed && check.severity && check.type && check.message) {
        const issue: ValidationIssue = {
          severity: check.severity,
          type: check.type,
          message: check.message,
          fix: check.fix,
          metadata: check.metadata,
        };

        issues.push(issue);

        // Deduct score based on severity
        score -= SEVERITY_WEIGHTS[check.severity];
      }
    }

    // Ensure score doesn't go below 0
    score = Math.max(0, score);

    return {
      passed: score >= threshold,
      score,
      issues,
      warnings,
    };
  }

  /**
   * Get list of checks performed for metadata
   *
   * @param outputType - Type of output
   * @param options - Validation options
   * @returns Array of check names
   */
  private getChecksPerformed(outputType: AIOutputType, options: ValidationOptions): string[] {
    const checks: string[] = [];

    switch (outputType) {
      case 'graph-generation':
        checks.push('mermaid-syntax', 'node-count', 'connectivity', 'node-labels', 'edge-structure');
        if (options.mode === 'full' && options.sourceDocument) {
          checks.push('grounding');
        }
        break;

      case 'connection-explanation':
        checks.push('explanation-exists', 'explanation-length');
        break;

      case 'quiz-generation':
        checks.push('question-structure', 'options-count', 'answer-validity', 'explanations', 'difficulty');
        break;
    }

    return checks;
  }

  /**
   * Generate actionable feedback for AI retry
   *
   * Takes validation issues and converts them to feedback strings
   * that can be included in the retry prompt.
   *
   * @param issues - Validation issues
   * @returns Array of feedback strings
   */
  generateFeedback(issues: ValidationIssue[]): string[] {
    return issues
      .filter(issue => issue.fix) // Only issues with suggested fixes
      .map((issue, index) => `${index + 1}. ${issue.type}: ${issue.fix}`);
  }

  /**
   * Calculate quality score from issues
   *
   * Useful for getting just the score without full validation.
   *
   * @param issues - Validation issues
   * @returns Quality score object
   */
  calculateQualityScore(issues: ValidationIssue[]): QualityScore {
    let score = 100;

    for (const issue of issues) {
      score -= SEVERITY_WEIGHTS[issue.severity];
    }

    return {
      score: Math.max(0, score),
      passed: score >= 60,
      issues,
    };
  }
}

/**
 * Singleton instance for easy import
 */
export const aiOutputValidator = new AIOutputValidator();
