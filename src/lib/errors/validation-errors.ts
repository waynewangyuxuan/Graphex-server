/**
 * Custom error classes for validation failures
 *
 * These errors provide structured information about validation failures,
 * enabling the AI orchestrator to retry with actionable feedback.
 *
 * @see src/lib/validation/ai-output-validator.ts
 */

import { ValidationIssue } from '../../types/validation.types';

/**
 * Base validation error class
 *
 * Thrown when AI output fails validation checks. Contains structured
 * information about what failed and how to fix it.
 */
export class ValidationError extends Error {
  public override name = 'ValidationError';

  constructor(
    message: string,
    public readonly issues: ValidationIssue[]
  ) {
    super(message);

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }

    // Set the prototype explicitly for instanceof checks to work
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  /**
   * Get all critical issues (those that prevent usage)
   */
  public getCriticalIssues(): ValidationIssue[] {
    return this.issues.filter(issue => issue.severity === 'critical');
  }

  /**
   * Get all high-severity issues
   */
  public getHighSeverityIssues(): ValidationIssue[] {
    return this.issues.filter(issue => issue.severity === 'high');
  }

  /**
   * Generate actionable feedback for AI retry
   *
   * Returns an array of strings that can be included in the retry prompt
   * to help the AI fix the issues.
   */
  public getRetryFeedback(): string[] {
    return this.issues
      .filter(issue => issue.fix) // Only issues with suggested fixes
      .map(issue => `${issue.type}: ${issue.fix}`);
  }

  /**
   * Format error for logging
   */
  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      issues: this.issues,
      criticalCount: this.getCriticalIssues().length,
      highSeverityCount: this.getHighSeverityIssues().length,
    };
  }
}

/**
 * Specific error for Mermaid syntax validation failures
 *
 * Thrown when Mermaid code cannot be parsed. This is a critical error
 * because invalid syntax will crash the renderer.
 */
export class MermaidSyntaxError extends ValidationError {
  public override name = 'MermaidSyntaxError';

  constructor(
    syntaxError: string,
    public readonly mermaidCode?: string
  ) {
    const issue: ValidationIssue = {
      severity: 'critical',
      type: 'invalid-mermaid',
      message: `Mermaid parsing failed: ${syntaxError}`,
      fix: 'Use valid Mermaid syntax. Example:\ngraph TD\n    A[Node 1] --> B[Node 2]\n    B --> C[Node 3]',
      metadata: {
        syntaxError,
        codeLength: mermaidCode?.length,
      },
    };

    super(`Invalid Mermaid syntax: ${syntaxError}`, [issue]);

    Object.setPrototypeOf(this, MermaidSyntaxError.prototype);
  }
}

/**
 * Error for when node count is outside acceptable range
 *
 * AI often ignores constraints, producing too few or too many nodes.
 * This error provides specific feedback about the expected range.
 */
export class NodeCountError extends ValidationError {
  public override name = 'NodeCountError';

  constructor(
    actualCount: number,
    expectedMin: number,
    expectedMax: number
  ) {
    const isTooFew = actualCount < expectedMin;
    const issue: ValidationIssue = {
      severity: 'high',
      type: isTooFew ? 'too-few-nodes' : 'too-many-nodes',
      message: isTooFew
        ? `Only ${actualCount} nodes found. Need at least ${expectedMin} nodes.`
        : `${actualCount} nodes found. Maximum is ${expectedMax} nodes.`,
      fix: isTooFew
        ? `Identify at least ${expectedMin} key concepts from the document. Focus on main ideas, definitions, and important relationships.`
        : `Reduce to the ${expectedMax} most important concepts only. Remove minor details and combine related concepts.`,
      metadata: {
        actualCount,
        expectedRange: { min: expectedMin, max: expectedMax },
      },
    };

    super(`Node count ${actualCount} is outside acceptable range [${expectedMin}, ${expectedMax}]`, [issue]);

    Object.setPrototypeOf(this, NodeCountError.prototype);
  }
}

/**
 * Error for disconnected nodes (orphans) in graph
 *
 * Orphaned nodes suggest incomplete analysis. Every concept should
 * connect to at least one other concept.
 */
export class DisconnectedNodesError extends ValidationError {
  public override name = 'DisconnectedNodesError';

  constructor(
    public readonly orphanedNodes: Array<{ id: string; title: string }>
  ) {
    const issue: ValidationIssue = {
      severity: 'medium',
      type: 'disconnected-nodes',
      message: `Found ${orphanedNodes.length} disconnected nodes: ${orphanedNodes.map(n => n.title).join(', ')}`,
      fix: 'Either connect these nodes to the main graph by identifying their relationships, or remove them if they are not central concepts.',
      metadata: {
        orphanedNodeIds: orphanedNodes.map(n => n.id),
        orphanedTitles: orphanedNodes.map(n => n.title),
      },
    };

    super(`${orphanedNodes.length} nodes are disconnected from the graph`, [issue]);

    Object.setPrototypeOf(this, DisconnectedNodesError.prototype);
  }
}

/**
 * Error for possible hallucination detection
 *
 * When nodes reference concepts not found in source document,
 * this suggests the AI is hallucinating. This is a high-severity
 * issue as it produces incorrect learning material.
 */
export class HallucinationError extends ValidationError {
  public override name = 'HallucinationError';

  constructor(
    public readonly unfoundConcepts: string[],
    public readonly totalConcepts: number
  ) {
    const percentage = Math.round((unfoundConcepts.length / totalConcepts) * 100);

    const issue: ValidationIssue = {
      severity: 'high',
      type: 'possible-hallucination',
      message: `${unfoundConcepts.length}/${totalConcepts} (${percentage}%) concepts not found in source document: ${unfoundConcepts.slice(0, 3).join(', ')}${unfoundConcepts.length > 3 ? '...' : ''}`,
      fix: 'Only extract concepts that are explicitly mentioned in the source document. Do not infer or create concepts that are not directly stated in the text.',
      metadata: {
        unfoundConcepts,
        totalConcepts,
        groundingPercentage: 100 - percentage,
      },
    };

    super(`Possible hallucination detected: ${percentage}% of concepts not found in source`, [issue]);

    Object.setPrototypeOf(this, HallucinationError.prototype);
  }
}

/**
 * Error for quiz validation failures
 *
 * Thrown when quiz questions don't meet requirements (wrong number
 * of options, invalid answer index, missing explanations, etc.)
 */
export class QuizValidationError extends ValidationError {
  public override name = 'QuizValidationError';

  constructor(issues: ValidationIssue[]) {
    super(`Quiz validation failed with ${issues.length} issues`, issues);

    Object.setPrototypeOf(this, QuizValidationError.prototype);
  }
}

/**
 * Error for empty or invalid explanations
 *
 * Connection explanations must have substance and source quotes.
 */
export class ExplanationValidationError extends ValidationError {
  public override name = 'ExplanationValidationError';

  constructor(issues: ValidationIssue[]) {
    super(`Explanation validation failed with ${issues.length} issues`, issues);

    Object.setPrototypeOf(this, ExplanationValidationError.prototype);
  }
}

/**
 * Type guard to check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Type guard to check if error is a MermaidSyntaxError
 */
export function isMermaidSyntaxError(error: unknown): error is MermaidSyntaxError {
  return error instanceof MermaidSyntaxError;
}
