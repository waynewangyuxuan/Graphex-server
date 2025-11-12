/**
 * Comprehensive tests for AI Output Validator
 *
 * These tests ensure the validator catches all major AI failure modes:
 * - Invalid Mermaid syntax (~10% of AI outputs)
 * - Wrong node counts (~20% of AI outputs)
 * - Orphaned nodes
 * - Hallucinations
 * - Invalid quiz structures
 * - Empty explanations
 *
 * Coverage target: 90%+
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AIOutputValidator } from '../ai-output-validator';
import { AIGraphOutput, AIConnectionOutput, AIQuizOutput } from '../../../types/validation.types';

describe('AIOutputValidator', () => {
  let validator: AIOutputValidator;

  beforeEach(() => {
    validator = new AIOutputValidator();
  });

  describe('Graph Validation', () => {
    it('should pass valid graph', async () => {
      const validGraph: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]\n    B --> C[Node 3]\n    C --> D[Node 4]\n    D --> E[Node 5]',
        nodes: [
          { id: 'A', title: 'Machine Learning' },
          { id: 'B', title: 'Neural Networks' },
          { id: 'C', title: 'Deep Learning' },
          { id: 'D', title: 'Backpropagation' },
          { id: 'E', title: 'Gradient Descent' },
        ],
        edges: [
          { fromNodeId: 'A', toNodeId: 'B' },
          { fromNodeId: 'B', toNodeId: 'C' },
          { fromNodeId: 'C', toNodeId: 'D' },
          { fromNodeId: 'D', toNodeId: 'E' },
        ],
      };

      const result = await validator.validate(validGraph, 'graph-generation', { mode: 'quick' });

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail on invalid Mermaid syntax', async () => {
      const invalidGraph: AIGraphOutput = {
        mermaidCode: 'invalid mermaid syntax here',
        nodes: [
          { id: 'A', title: 'Node 1' },
          { id: 'B', title: 'Node 2' },
          { id: 'C', title: 'Node 3' },
          { id: 'D', title: 'Node 4' },
          { id: 'E', title: 'Node 5' },
        ],
        edges: [{ fromNodeId: 'A', toNodeId: 'B' }],
      };

      const result = await validator.validate(invalidGraph, 'graph-generation', { mode: 'quick' });

      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          type: 'invalid-mermaid',
        })
      );
    });

    it('should fail on empty Mermaid code', async () => {
      const emptyGraph: AIGraphOutput = {
        mermaidCode: '',
        nodes: [
          { id: 'A', title: 'Node 1' },
          { id: 'B', title: 'Node 2' },
          { id: 'C', title: 'Node 3' },
          { id: 'D', title: 'Node 4' },
          { id: 'E', title: 'Node 5' },
        ],
        edges: [],
      };

      const result = await validator.validate(emptyGraph, 'graph-generation', { mode: 'quick' });

      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          type: 'invalid-mermaid',
          message: 'Mermaid code is empty',
        })
      );
    });

    it('should fail on too few nodes (< 5)', async () => {
      const tooFewNodes: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]',
        nodes: [
          { id: 'A', title: 'Node 1' },
          { id: 'B', title: 'Node 2' },
        ],
        edges: [{ fromNodeId: 'A', toNodeId: 'B' }],
      };

      // Use a higher threshold to ensure this fails
      const result = await validator.validate(tooFewNodes, 'graph-generation', { mode: 'quick', threshold: 85 });

      expect(result.passed).toBe(false);
      const issue = result.issues.find(i => i.type === 'too-few-nodes');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('high');
      expect(issue?.message).toContain('2 nodes');
      expect(issue?.metadata?.actualCount).toBe(2);
    });

    it('should fail on too many nodes (> 15)', async () => {
      const tooManyNodes: AIGraphOutput = {
        mermaidCode: 'graph TD\n' + Array.from({ length: 20 }, (_, i) => `    N${i}[Node ${i}]`).join('\n'),
        nodes: Array.from({ length: 20 }, (_, i) => ({ id: `N${i}`, title: `Node ${i}` })),
        edges: Array.from({ length: 19 }, (_, i) => ({ fromNodeId: `N${i}`, toNodeId: `N${i + 1}` })),
      };

      // Use higher threshold to ensure this fails
      const result = await validator.validate(tooManyNodes, 'graph-generation', { mode: 'quick', threshold: 85 });

      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'high',
          type: 'too-many-nodes',
          message: expect.stringContaining('20 nodes'),
        })
      );
    });

    it('should detect orphan nodes', async () => {
      const graphWithOrphans: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]\n    B --> E[Node 3]',
        nodes: [
          { id: 'A', title: 'Connected 1' },
          { id: 'B', title: 'Connected 2' },
          { id: 'C', title: 'Orphan 1' },
          { id: 'D', title: 'Orphan 2' },
          { id: 'E', title: 'Connected 3' },
          { id: 'F', title: 'Orphan 3' },
        ],
        edges: [
          { fromNodeId: 'A', toNodeId: 'B' },
          { fromNodeId: 'B', toNodeId: 'E' },
        ],
      };

      // Use threshold that makes the test fail with orphan penalty
      // Score: 100 - 10 (medium for orphans) = 90, so need threshold > 90 to fail
      const result = await validator.validate(graphWithOrphans, 'graph-generation', { mode: 'quick', threshold: 95 });

      expect(result.passed).toBe(false);

      const issue = result.issues.find(i => i.type === 'disconnected-nodes');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('medium');
      expect(issue?.message).toContain('3 disconnected nodes');
      expect(issue?.metadata?.orphanedNodeIds).toContain('C');
      expect(issue?.metadata?.orphanedNodeIds).toContain('D');
      expect(issue?.metadata?.orphanedNodeIds).toContain('F');
    });

    it('should fail on empty node labels', async () => {
      const emptyLabels: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Good Label] --> B[Node 2]\n    B --> C[Another Good]\n    C --> D[X]\n    D --> E[Valid]',
        nodes: [
          { id: 'A', title: 'Good Label' },
          { id: 'B', title: '' }, // Empty
          { id: 'C', title: 'Another Good' },
          { id: 'D', title: 'X' }, // Too short
          { id: 'E', title: 'Valid' },
        ],
        edges: [
          { fromNodeId: 'A', toNodeId: 'B' },
          { fromNodeId: 'B', toNodeId: 'C' },
          { fromNodeId: 'C', toNodeId: 'D' },
          { fromNodeId: 'D', toNodeId: 'E' },
        ],
      };

      // Score: 100 - 20 (high for empty labels) = 80, so need threshold > 80
      const result = await validator.validate(emptyLabels, 'graph-generation', { mode: 'quick', threshold: 85 });

      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'high',
          type: 'empty-labels',
        })
      );
    });

    it('should fail on excessively long labels', async () => {
      const longLabels: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Good Label] --> B[Node 2]\n    B --> C[Another Good]\n    C --> D[Valid]\n    D --> E[Also Valid]',
        nodes: [
          { id: 'A', title: 'Good Label' },
          { id: 'B', title: 'A'.repeat(150) }, // Too long
          { id: 'C', title: 'Another Good' },
          { id: 'D', title: 'Valid' },
          { id: 'E', title: 'Also Valid' },
        ],
        edges: [
          { fromNodeId: 'A', toNodeId: 'B' },
          { fromNodeId: 'B', toNodeId: 'C' },
          { fromNodeId: 'C', toNodeId: 'D' },
          { fromNodeId: 'D', toNodeId: 'E' },
        ],
      };

      // Score: 100 - 10 (medium for long labels) = 90, need threshold > 90
      const result = await validator.validate(longLabels, 'graph-generation', { mode: 'quick', threshold: 95 });

      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'medium',
          type: 'empty-labels',
        })
      );
    });

    it('should detect possible hallucinations', async () => {
      const hallucinatingGraph: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Quantum Entanglement] --> B[Schrodinger Cat]\n    B --> C[Wave Function]\n    C --> D[Machine Learning]\n    D --> E[Neural Networks]',
        nodes: [
          { id: 'A', title: 'Quantum Entanglement' }, // Not in source
          { id: 'B', title: 'Schrodinger Cat' }, // Not in source
          { id: 'C', title: 'Wave Function' }, // Not in source
          { id: 'D', title: 'Machine Learning' }, // In source
          { id: 'E', title: 'Neural Networks' }, // In source
        ],
        edges: [
          { fromNodeId: 'A', toNodeId: 'B' },
          { fromNodeId: 'B', toNodeId: 'C' },
          { fromNodeId: 'C', toNodeId: 'D' },
          { fromNodeId: 'D', toNodeId: 'E' },
        ],
      };

      const sourceDocument = {
        text: 'This document is about machine learning and neural networks. It covers supervised learning, unsupervised learning, and deep learning techniques.',
      };

      // Score: 100 - 20 (high for hallucination) = 80, use threshold > 80
      const result = await validator.validate(hallucinatingGraph, 'graph-generation', {
        mode: 'full',
        sourceDocument,
        threshold: 85,
      });

      expect(result.passed).toBe(false);

      const issue = result.issues.find(i => i.type === 'possible-hallucination');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('high');
      expect(issue?.metadata?.groundingPercentage).toBeLessThan(80);
    });

    it('should fail on invalid edge structure', async () => {
      const invalidEdges: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]\n    B --> C[Node 3]\n    C --> D[Node 4]\n    D --> E[Node 5]',
        nodes: [
          { id: 'A', title: 'Node 1' },
          { id: 'B', title: 'Node 2' },
          { id: 'C', title: 'Node 3' },
          { id: 'D', title: 'Node 4' },
          { id: 'E', title: 'Node 5' },
        ],
        edges: [
          { fromNodeId: 'A', toNodeId: 'B' },
          { fromNodeId: 'B', toNodeId: 'X' }, // X doesn't exist
          { fromNodeId: 'Y', toNodeId: 'C' }, // Y doesn't exist
        ],
      };

      // Score: 100 - 20 (high for invalid edges) = 80, use threshold > 80
      const result = await validator.validate(invalidEdges, 'graph-generation', { mode: 'quick', threshold: 85 });

      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'high',
          type: 'invalid-edge-structure',
        })
      );
    });

    it('should calculate quality score correctly', async () => {
      const graph: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]',
        nodes: [
          { id: 'A', title: 'Node 1' },
          { id: 'B', title: 'Node 2' },
        ], // Too few nodes (high severity = -20)
        edges: [{ fromNodeId: 'A', toNodeId: 'B' }],
      };

      const result = await validator.validate(graph, 'graph-generation', { mode: 'quick' });

      // Starting score: 100
      // Too few nodes: -20 (high severity)
      // Expected: 80 (Mermaid syntax is actually valid for this simple graph)
      expect(result.score).toBe(80);
    });

    it('should generate actionable feedback', async () => {
      const graph: AIGraphOutput = {
        mermaidCode: 'invalid syntax',
        nodes: [{ id: 'A', title: 'Node 1' }], // Too few
        edges: [],
      };

      const result = await validator.validate(graph, 'graph-generation', { mode: 'quick' });

      const feedback = validator.generateFeedback(result.issues);

      expect(feedback.length).toBeGreaterThan(0);
      expect(feedback.some(f => f.includes('invalid-mermaid'))).toBe(true);
      expect(feedback.some(f => f.includes('too-few-nodes'))).toBe(true);
    });
  });

  describe('Connection Explanation Validation', () => {
    it('should pass valid explanation', async () => {
      const validExplanation: AIConnectionOutput = {
        explanation:
          'Neural networks are a subset of machine learning algorithms inspired by biological neural networks. They consist of interconnected nodes (neurons) organized in layers.',
        sourceQuotes: ['machine learning algorithms', 'biological neural networks'],
        nodeReferences: {
          fromNodeId: 'A',
          toNodeId: 'B',
        },
      };

      const result = await validator.validate(validExplanation, 'connection-explanation');

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail on empty explanation', async () => {
      const emptyExplanation: AIConnectionOutput = {
        explanation: '',
      };

      const result = await validator.validate(emptyExplanation, 'connection-explanation');

      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          type: 'empty-explanation',
        })
      );
    });

    it('should fail on too short explanation', async () => {
      const shortExplanation: AIConnectionOutput = {
        explanation: 'Related concepts.',
      };

      // Score: 100 - 20 (high for too short) = 80, use threshold > 80
      const result = await validator.validate(shortExplanation, 'connection-explanation', { threshold: 85 });

      // Should fail because explanation is < 50 chars (only ~17 chars)
      expect(result.passed).toBe(false);

      const issue = result.issues.find(i => i.type === 'explanation-too-short');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('high');
    });

    it('should fail on too long explanation', async () => {
      const longExplanation: AIConnectionOutput = {
        explanation: 'A'.repeat(1500),
      };

      // Score: 100 - 10 (medium for too long) = 90, use threshold > 90
      const result = await validator.validate(longExplanation, 'connection-explanation', { threshold: 95 });

      // Should fail because explanation is > 1000 chars (1500 chars)
      expect(result.passed).toBe(false);

      const issue = result.issues.find(i => i.type === 'explanation-too-long');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('medium');
    });

    it('should warn on missing source quotes', async () => {
      const noQuotes: AIConnectionOutput = {
        explanation:
          'This is a valid length explanation about how these two concepts are related to each other in the context of the document.',
      };

      const result = await validator.validate(noQuotes, 'connection-explanation');

      expect(result.warnings.some(w => w.includes('No source quotes'))).toBe(true);
    });
  });

  describe('Quiz Validation', () => {
    it('should pass valid quiz', async () => {
      const validQuiz: AIQuizOutput = {
        questions: [
          {
            questionText: 'What is machine learning?',
            options: [
              'A type of computer hardware',
              'A method for computers to learn from data',
              'A programming language',
              'A database system',
            ],
            correctAnswerIndex: 1,
            explanation: 'Machine learning is a method that allows computers to learn from data without being explicitly programmed.',
            difficulty: 'medium',
            nodeReferences: ['A'],
          },
          {
            questionText: 'Which technique is used in deep learning?',
            options: ['Linear regression', 'Neural networks', 'Binary search', 'Bubble sort'],
            correctAnswerIndex: 1,
            explanation: 'Deep learning primarily uses neural networks with multiple layers.',
            difficulty: 'easy',
            nodeReferences: ['B'],
          },
        ],
      };

      const result = await validator.validate(validQuiz, 'quiz-generation');

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail on wrong number of options', async () => {
      const wrongOptions: AIQuizOutput = {
        questions: [
          {
            questionText: 'What is AI?',
            options: ['Option 1', 'Option 2'], // Only 2 options instead of 4
            correctAnswerIndex: 0,
            explanation: 'Explanation here',
            difficulty: 'easy',
          },
        ],
      };

      // Score: 100 - 40 (critical for invalid options) = 60, use threshold > 60
      const result = await validator.validate(wrongOptions, 'quiz-generation', { threshold: 65 });

      expect(result.passed).toBe(false);

      const issue = result.issues.find(i => i.type === 'invalid-options-count');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('critical');
    });

    it('should fail on invalid answer index', async () => {
      const invalidAnswer: AIQuizOutput = {
        questions: [
          {
            questionText: 'What is AI?',
            options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
            correctAnswerIndex: 5, // Invalid - should be 0-3
            explanation: 'Explanation here',
            difficulty: 'easy',
          },
        ],
      };

      // Score: 100 - 40 (critical for invalid index) = 60, use threshold > 60
      const result = await validator.validate(invalidAnswer, 'quiz-generation', { threshold: 65 });

      expect(result.passed).toBe(false);

      const issue = result.issues.find(i => i.type === 'invalid-answer-index');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('critical');
    });

    it('should fail on missing explanation', async () => {
      const noExplanation: AIQuizOutput = {
        questions: [
          {
            questionText: 'What is AI?',
            options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
            correctAnswerIndex: 0,
            explanation: '', // Empty
            difficulty: 'easy',
          },
        ],
      };

      // Score: 100 - 20 (high for missing explanation) = 80, use threshold > 80
      const result = await validator.validate(noExplanation, 'quiz-generation', { threshold: 85 });

      expect(result.passed).toBe(false);

      const issue = result.issues.find(i => i.type === 'missing-explanation');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('high');
    });

    it('should fail on invalid difficulty', async () => {
      const invalidDifficulty: AIQuizOutput = {
        questions: [
          {
            questionText: 'What is AI?',
            options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
            correctAnswerIndex: 0,
            explanation: 'Valid explanation',
            difficulty: 'super-hard' as 'easy', // Invalid
          },
        ],
      };

      // Score: 100 - 10 (medium for invalid difficulty) = 90, use threshold > 90
      const result = await validator.validate(invalidDifficulty, 'quiz-generation', { threshold: 95 });

      expect(result.passed).toBe(false);

      const issue = result.issues.find(i => i.type === 'missing-difficulty');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('medium');
    });

    it('should validate multiple questions', async () => {
      const multipleIssues: AIQuizOutput = {
        questions: [
          {
            questionText: 'Valid question?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswerIndex: 0,
            explanation: 'Good explanation',
            difficulty: 'easy',
          },
          {
            questionText: 'Invalid question?',
            options: ['A', 'B'], // Wrong count
            correctAnswerIndex: 5, // Invalid index
            explanation: '', // Empty
            difficulty: 'invalid' as 'easy', // Invalid
          },
        ],
      };

      const result = await validator.validate(multipleIssues, 'quiz-generation');

      expect(result.passed).toBe(false);
      expect(result.issues.length).toBeGreaterThan(3); // Multiple issues for question 2
    });
  });

  describe('Validation Options', () => {
    it('should respect custom threshold', async () => {
      const graph: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]',
        nodes: [
          { id: 'A', title: 'Node 1' },
          { id: 'B', title: 'Node 2' },
        ], // Score will be 80 (too few nodes = -20)
        edges: [{ fromNodeId: 'A', toNodeId: 'B' }],
      };

      // With low threshold (70), should pass (score is 80)
      const result1 = await validator.validate(graph, 'graph-generation', { threshold: 70 });
      expect(result1.passed).toBe(true);

      // With higher threshold (85), should fail (score is 80)
      const result2 = await validator.validate(graph, 'graph-generation', { threshold: 85 });
      expect(result2.passed).toBe(false);
    });

    it('should include metadata when requested', async () => {
      const graph: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]\n    B --> C[Node 3]\n    C --> D[Node 4]\n    D --> E[Node 5]',
        nodes: [
          { id: 'A', title: 'Node 1' },
          { id: 'B', title: 'Node 2' },
          { id: 'C', title: 'Node 3' },
          { id: 'D', title: 'Node 4' },
          { id: 'E', title: 'Node 5' },
        ],
        edges: [
          { fromNodeId: 'A', toNodeId: 'B' },
          { fromNodeId: 'B', toNodeId: 'C' },
          { fromNodeId: 'C', toNodeId: 'D' },
          { fromNodeId: 'D', toNodeId: 'E' },
        ],
      };

      const result = await validator.validate(graph, 'graph-generation', {
        includeMetadata: true,
        mode: 'quick',
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.mode).toBe('quick');
      expect(result.metadata?.timestamp).toBeInstanceOf(Date);
      expect(result.metadata?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.checksPerformed).toContain('mermaid-syntax');
      expect(result.metadata?.checksPerformed).toContain('node-count');
    });

    it('should skip grounding check in quick mode', async () => {
      const graph: AIGraphOutput = {
        mermaidCode: 'graph TD\n    A[Node 1] --> B[Node 2]',
        nodes: [
          { id: 'A', title: 'Quantum Physics' }, // Not in source
          { id: 'B', title: 'Black Holes' }, // Not in source
          { id: 'C', title: 'String Theory' }, // Not in source
          { id: 'D', title: 'Relativity' }, // Not in source
          { id: 'E', title: 'Gravity' }, // Not in source
        ],
        edges: [
          { fromNodeId: 'A', toNodeId: 'B' },
          { fromNodeId: 'B', toNodeId: 'C' },
          { fromNodeId: 'C', toNodeId: 'D' },
          { fromNodeId: 'D', toNodeId: 'E' },
        ],
      };

      const sourceDocument = {
        text: 'This is about machine learning and AI.',
      };

      // Quick mode should skip grounding
      const quickResult = await validator.validate(graph, 'graph-generation', {
        mode: 'quick',
        sourceDocument,
      });

      expect(quickResult.issues).not.toContainEqual(
        expect.objectContaining({
          type: 'possible-hallucination',
        })
      );

      // Full mode should check grounding
      const fullResult = await validator.validate(graph, 'graph-generation', {
        mode: 'full',
        sourceDocument,
      });

      expect(fullResult.issues).toContainEqual(
        expect.objectContaining({
          type: 'possible-hallucination',
        })
      );
    });
  });

  describe('Quality Score Calculation', () => {
    it('should calculate correct score with multiple severity levels', async () => {
      const graph: AIGraphOutput = {
        mermaidCode: 'invalid', // Critical (-40) for declaration, critical (-40) for nodes
        nodes: [
          { id: 'A', title: 'Node 1' },
          { id: 'B', title: '' },
        ], // Too few (-20) + empty label (-20)
        edges: [],
      };

      const result = await validator.validate(graph, 'graph-generation', { mode: 'quick' });

      // Starting: 100
      // Invalid Mermaid declaration (critical): -40
      // Too few nodes (high): -20
      // Empty labels (high): -20
      // Invalid edges might trigger too if edges array is empty
      // Total penalties vary, but score will be low and definitely fail
      expect(result.score).toBeLessThanOrEqual(20);
      expect(result.passed).toBe(false);
    });

    it('should not go below 0 score', async () => {
      const graph: AIGraphOutput = {
        mermaidCode: 'invalid', // Critical (-40)
        nodes: [{ id: 'A', title: '' }], // Too few (-20) + empty (-20)
        edges: [
          { fromNodeId: 'A', toNodeId: 'X' },
          { fromNodeId: 'Y', toNodeId: 'Z' },
        ], // Invalid edges (-20)
      };

      const result = await validator.validate(graph, 'graph-generation', { mode: 'quick' });

      // Would be negative, but clamped to 0
      expect(result.score).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });
});
