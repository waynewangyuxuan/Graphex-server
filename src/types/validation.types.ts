/**
 * Type definitions for AI output validation system
 *
 * This module defines the types used throughout the validation pipeline,
 * which is critical for catching AI failures before they reach production.
 *
 * @see META/SERVICE_DESIGN_V2.md Section 2.3
 * @see META/SERVICE_DESIGN_REFLECTION.md Lines 267-421
 */

/**
 * Severity levels for validation issues
 * - critical: Invalid output that will break functionality (e.g., syntax errors)
 * - high: Significant quality issues (e.g., wrong node count, orphans)
 * - medium: Minor quality concerns (e.g., suboptimal structure)
 * - low: Warnings that don't prevent usage
 */
export type ValidationSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Types of validation failures that can occur
 */
export type ValidationIssueType =
  // Syntax and structure
  | 'invalid-syntax'
  | 'invalid-mermaid'
  | 'parse-error'

  // Node validation
  | 'too-few-nodes'
  | 'too-many-nodes'
  | 'empty-labels'
  | 'invalid-node-structure'

  // Edge validation
  | 'disconnected-nodes'
  | 'invalid-edge-structure'
  | 'missing-relationships'

  // Grounding and quality
  | 'possible-hallucination'
  | 'low-grounding'
  | 'missing-source-references'

  // Quiz validation
  | 'wrong-question-count'
  | 'invalid-options-count'
  | 'invalid-answer-index'
  | 'missing-explanation'
  | 'missing-difficulty'

  // Connection explanation
  | 'empty-explanation'
  | 'missing-quotes'
  | 'explanation-too-short'
  | 'explanation-too-long'
  | 'missing-node-references';

/**
 * A single validation issue found during validation
 */
export interface ValidationIssue {
  /** Severity of the issue (determines score deduction) */
  severity: ValidationSeverity;

  /** Type of validation failure */
  type: ValidationIssueType;

  /** Human-readable description of the issue */
  message: string;

  /** Optional suggested fix that can be fed back to AI for retry */
  fix?: string;

  /** Additional context about the issue */
  metadata?: {
    /** For node count issues, actual count */
    actualCount?: number;

    /** For node count issues, expected range */
    expectedRange?: { min: number; max: number };

    /** For orphan nodes, list of orphaned node IDs */
    orphanedNodeIds?: string[];

    /** For hallucination detection, concepts not found */
    unfoundConcepts?: string[];

    /** Percentage of content that appears grounded */
    groundingPercentage?: number;

    /** Any other relevant data */
    [key: string]: unknown;
  };
}

/**
 * Result of a single validation check
 */
export interface ValidationCheck {
  /** Whether this check passed */
  passed: boolean;

  /** Type of issue if failed (undefined if passed) */
  type?: ValidationIssueType;

  /** Severity if failed (undefined if passed) */
  severity?: ValidationSeverity;

  /** Message if failed (undefined if passed) */
  message?: string;

  /** Suggested fix if failed (undefined if passed) */
  fix?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Overall validation result with quality scoring
 */
export interface ValidationResult {
  /** Whether validation passed (score >= threshold) */
  passed: boolean;

  /** Quality score from 0-100 (100 = perfect) */
  score: number;

  /** All issues found during validation */
  issues: ValidationIssue[];

  /** Non-critical warnings */
  warnings: string[];

  /** Optional metadata about validation */
  metadata?: {
    /** Validation mode used */
    mode?: 'quick' | 'full';

    /** Timestamp of validation */
    timestamp?: Date;

    /** Time spent validating in ms */
    durationMs?: number;

    /** Which validations were run */
    checksPerformed?: string[];
  };
}

/**
 * Options for validation behavior
 */
export interface ValidationOptions {
  /** Minimum score required to pass (default: 60) */
  threshold?: number;

  /** Validation mode - quick for retry loop, full for final output */
  mode?: 'quick' | 'full';

  /** Source document for grounding validation */
  sourceDocument?: {
    text: string;
    id?: string;
  };

  /** Whether to include detailed metadata in result */
  includeMetadata?: boolean;
}

/**
 * Quality score with breakdown
 */
export interface QualityScore {
  /** Overall score 0-100 */
  score: number;

  /** Whether score meets threshold */
  passed: boolean;

  /** Issues that caused score deductions */
  issues: ValidationIssue[];

  /** Optional score breakdown by category */
  breakdown?: {
    syntax?: number;
    structure?: number;
    quality?: number;
    grounding?: number;
  };
}

/**
 * Graph structure expected from AI
 */
export interface AIGraphOutput {
  /** Mermaid syntax string */
  mermaidCode: string;

  /** Parsed nodes from graph */
  nodes: Array<{
    id: string;
    title: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }>;

  /** Parsed edges from graph */
  edges: Array<{
    fromNodeId: string;
    toNodeId: string;
    relationship?: string;
    metadata?: Record<string, unknown>;
  }>;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Connection explanation output from AI
 */
export interface AIConnectionOutput {
  /** Explanation text */
  explanation: string;

  /** Source quotes supporting the explanation */
  sourceQuotes?: string[];

  /** References to nodes involved */
  nodeReferences?: {
    fromNodeId: string;
    toNodeId: string;
  };

  /** Confidence in the explanation (0-1) */
  confidence?: number;
}

/**
 * Quiz question output from AI
 */
export interface AIQuizOutput {
  /** Array of generated questions */
  questions: Array<{
    /** Question text */
    questionText: string;

    /** Array of 4 options */
    options: string[];

    /** Index of correct answer (0-3) */
    correctAnswerIndex: number;

    /** Explanation of the correct answer */
    explanation: string;

    /** Difficulty level */
    difficulty: 'easy' | 'medium' | 'hard';

    /** Which nodes this question tests */
    nodeReferences?: string[];
  }>;
}

/**
 * Union type for all AI output types
 */
export type AIOutput = AIGraphOutput | AIConnectionOutput | AIQuizOutput;

/**
 * Type of AI output being validated
 */
export type AIOutputType = 'graph-generation' | 'connection-explanation' | 'quiz-generation';
