/**
 * Graph Validator Tests
 *
 * Tests for graph validation and auto-fix functionality:
 * - Valid Mermaid syntax
 * - Orphaned edges
 * - Duplicate edges
 * - Isolated nodes
 * - Node count validation
 */

import { GraphValidator } from '../graph-validator';
import { logger } from '../../../utils/logger.util';
import { GraphData, ValidationErrorCode } from '../../../types/graph.types';

describe('GraphValidator', () => {
  let validator: GraphValidator;

  beforeEach(() => {
    validator = new GraphValidator(logger);
  });

  describe('Basic Validation', () => {
    it('should validate a valid graph', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [
          { from: '1', to: '2', relationship: 'relates to' },
          { from: '2', to: '3', relationship: 'leads to' },
          { from: '3', to: '4', relationship: 'supports' },
        ],
      };

      const result = await validator.validate(graph);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fixedGraph).toBeUndefined();
    });

    it('should reject graph with invalid structure', async () => {
      const invalidGraph = {
        nodes: null,
        edges: [],
      } as any;

      await expect(validator.validate(invalidGraph)).rejects.toThrow(
        'Graph nodes must be an array',
      );
    });
  });

  describe('Node Validation', () => {
    it('should detect missing node IDs', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '', title: 'Node A' },
          { id: '2', title: 'Node B' },
        ] as any,
        edges: [],
      };

      const result = await validator.validate(graph);

      expect(result.isValid).toBe(false);
      const error = result.errors.find(
        (e) => e.code === ValidationErrorCode.MISSING_NODE_ID,
      );
      expect(error).toBeDefined();
    });

    it('should detect duplicate node IDs', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '1', title: 'Node B' },
          { id: '2', title: 'Node C' },
        ],
        edges: [],
      };

      const result = await validator.validate(graph);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(
        true,
      );
    });

    it('should detect too few nodes', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
        ],
        edges: [{ from: '1', to: '2', relationship: 'relates to' }],
      };

      const result = await validator.validate(graph);

      expect(result.isValid).toBe(false);
      const error = result.errors.find(
        (e) => e.code === ValidationErrorCode.TOO_FEW_NODES,
      );
      expect(error).toBeDefined();
      expect(error?.message).toContain('too few nodes');
    });

    it('should detect too many nodes (and auto-fix)', async () => {
      const nodes = Array.from({ length: 20 }, (_, i) => ({
        id: `${i + 1}`,
        title: `Node ${i + 1}`,
      }));

      const graph: GraphData = {
        nodes,
        edges: [],
      };

      const result = await validator.validate(graph);

      // Auto-fix should trim nodes, so fixedGraph should be valid
      expect(result.fixedGraph).toBeDefined();
      expect(result.fixedGraph!.nodes.length).toBeLessThanOrEqual(15);
      expect(result.statistics.nodesRemoved).toBe(5);
    });
  });

  describe('Edge Validation', () => {
    it('should detect missing edge fields', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
        ],
        edges: [{ from: '1', to: '', relationship: 'relates to' }] as any,
      };

      const result = await validator.validate(graph);

      expect(result.isValid).toBe(false);
      const error = result.errors.find(
        (e) => e.code === ValidationErrorCode.MISSING_EDGE_FIELD,
      );
      expect(error).toBeDefined();
    });

    it('should detect orphaned edges', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
        ],
        edges: [
          { from: '1', to: '2', relationship: 'relates to' },
          { from: '2', to: '999', relationship: 'leads to' }, // Orphaned
        ],
      };

      const result = await validator.validate(graph);

      expect(result.isValid).toBe(false);
      const error = result.errors.find(
        (e) => e.code === ValidationErrorCode.ORPHANED_EDGE,
      );
      expect(error).toBeDefined();
      expect(error?.message).toContain('orphaned edges');
    });

    it('should detect duplicate edges', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [
          { from: '1', to: '2', relationship: 'relates to' },
          { from: '1', to: '2', relationship: 'relates to' }, // Duplicate
        ],
      };

      const result = await validator.validate(graph);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('duplicate'))).toBe(true);
    });

    it('should detect self-referencing edges', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [
          { from: '1', to: '1', relationship: 'relates to' }, // Self-reference
          { from: '2', to: '3', relationship: 'leads to' },
        ],
      };

      const result = await validator.validate(graph);

      expect(result.warnings.some((w) => w.includes('self-referencing'))).toBe(
        true,
      );
    });
  });

  describe('Auto-Fix Functionality', () => {
    it('should auto-fix orphaned edges', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [
          { from: '1', to: '2', relationship: 'relates to' },
          { from: '2', to: '999', relationship: 'leads to' }, // Orphaned
          { from: '3', to: '4', relationship: 'supports' },
        ],
      };

      const result = await validator.validate(graph);

      expect(result.fixedGraph).toBeDefined();
      expect(result.fixedGraph!.edges).toHaveLength(2);
      expect(result.statistics.orphanedEdgesRemoved).toBe(1);

      const fix = result.fixes.find((f) => f.description.includes('orphaned'));
      expect(fix).toBeDefined();
    });

    it('should auto-fix duplicate edges', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [
          { from: '1', to: '2', relationship: 'relates to' },
          { from: '1', to: '2', relationship: 'relates to' }, // Duplicate
          { from: '2', to: '3', relationship: 'leads to' },
        ],
      };

      const result = await validator.validate(graph);

      expect(result.fixedGraph).toBeDefined();
      expect(result.fixedGraph!.edges).toHaveLength(2);
      expect(result.statistics.duplicateEdgesRemoved).toBe(1);
    });

    it('should auto-fix self-referencing edges', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [
          { from: '1', to: '1', relationship: 'relates to' }, // Self-reference
          { from: '2', to: '3', relationship: 'leads to' },
        ],
      };

      const result = await validator.validate(graph);

      expect(result.fixedGraph).toBeDefined();
      expect(result.fixedGraph!.edges).toHaveLength(1);
      expect(result.statistics.selfReferencesRemoved).toBe(1);
    });

    it('should trim excess nodes by connection count', async () => {
      const nodes = Array.from({ length: 20 }, (_, i) => ({
        id: `${i + 1}`,
        title: `Node ${i + 1}`,
      }));

      // Create edges for first 10 nodes (more connected)
      const edges = Array.from({ length: 9 }, (_, i) => ({
        from: `${i + 1}`,
        to: `${i + 2}`,
        relationship: 'relates to',
      }));

      const graph: GraphData = { nodes, edges };

      const result = await validator.validate(graph);

      expect(result.fixedGraph).toBeDefined();
      expect(result.fixedGraph!.nodes).toHaveLength(15);
      expect(result.statistics.nodesRemoved).toBe(5);

      const fix = result.fixes.find((f) => f.description.includes('excess'));
      expect(fix).toBeDefined();
    });

    it('should apply multiple fixes in one pass', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [
          { from: '1', to: '2', relationship: 'relates to' },
          { from: '1', to: '2', relationship: 'relates to' }, // Duplicate
          { from: '2', to: '999', relationship: 'leads to' }, // Orphaned
          { from: '3', to: '3', relationship: 'relates to' }, // Self-reference
        ],
      };

      const result = await validator.validate(graph);

      expect(result.fixedGraph).toBeDefined();
      expect(result.fixedGraph!.edges).toHaveLength(1);
      expect(result.fixes.length).toBeGreaterThan(1);
    });
  });

  describe('Isolated Node Detection', () => {
    it('should detect isolated nodes', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' }, // Isolated
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [
          { from: '1', to: '2', relationship: 'relates to' },
          { from: '4', to: '5', relationship: 'leads to' },
        ],
      };

      const result = await validator.validate(graph);

      expect(result.warnings.some((w) => w.includes('isolated'))).toBe(true);
    });

    it('should handle graph with all isolated nodes', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [],
      };

      const result = await validator.validate(graph);

      expect(result.warnings.some((w) => w.includes('isolated'))).toBe(true);
    });
  });

  describe('Mermaid Syntax Validation', () => {
    it('should validate correct Mermaid syntax', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [{ from: '1', to: '2', relationship: 'relates to' }],
        mermaidCode: 'graph TD\n  1[Node A] --> 2[Node B]',
      };

      const result = await validator.validate(graph);

      expect(result.isValid).toBe(true);
    });

    it('should detect missing graph directive', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [{ from: '1', to: '2', relationship: 'relates to' }],
        mermaidCode: '1[Node A] --> 2[Node B]', // Missing "graph TD"
      };

      const result = await validator.validate(graph);

      expect(result.isValid).toBe(false);
      const error = result.errors.find(
        (e) => e.code === ValidationErrorCode.INVALID_MERMAID_SYNTAX,
      );
      expect(error).toBeDefined();
    });

    it('should detect unbalanced brackets', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [{ from: '1', to: '2', relationship: 'relates to' }],
        mermaidCode: 'graph TD\n  1[Node A --> 2[Node B]', // Unbalanced
      };

      const result = await validator.validate(graph);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.message.includes('Unbalanced')),
      ).toBe(true);
    });

    it('should auto-fix Mermaid syntax by regenerating', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [{ from: '1', to: '2', relationship: 'relates to' }],
        mermaidCode: 'invalid mermaid code',
      };

      const result = await validator.validate(graph);

      expect(result.fixedGraph).toBeDefined();
      expect(result.fixedGraph!.mermaidCode).toBeDefined();
      expect(result.fixedGraph!.mermaidCode).toContain('graph TD');

      const fix = result.fixes.find((f) => f.description.includes('Mermaid'));
      expect(fix).toBeDefined();
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom node count limits', async () => {
      const customValidator = new GraphValidator(logger, {
        minNodes: 3,
        maxNodes: 5,
      });

      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
        ],
        edges: [],
      };

      const result = await customValidator.validate(graph);

      expect(result.isValid).toBe(true);
    });

    it('should allow disabling auto-fix', async () => {
      const noFixValidator = new GraphValidator(logger, { autoFix: false });

      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [
          { from: '1', to: '2', relationship: 'relates to' },
          { from: '2', to: '999', relationship: 'leads to' }, // Orphaned
        ],
      };

      const result = await noFixValidator.validate(graph);

      expect(result.isValid).toBe(false);
      expect(result.fixedGraph).toBeUndefined();
      expect(result.fixes).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', async () => {
      const graph: GraphData = {
        nodes: [
          { id: '1', title: 'Node A' },
          { id: '2', title: 'Node B' },
          { id: '3', title: 'Node C' },
          { id: '4', title: 'Node D' },
          { id: '5', title: 'Node E' },
          { id: '6', title: 'Node F' },
          { id: '7', title: 'Node G' },
        ],
        edges: [
          { from: '1', to: '2', relationship: 'relates to' },
          { from: '1', to: '2', relationship: 'relates to' }, // Duplicate
          { from: '2', to: '999', relationship: 'leads to' }, // Orphaned
        ],
      };

      const result = await validator.validate(graph);

      expect(result.statistics.nodeCount).toBe(7);
      expect(result.statistics.edgeCount).toBe(1); // After fixes
      expect(result.statistics.orphanedEdgesRemoved).toBe(1);
      expect(result.statistics.duplicateEdgesRemoved).toBe(1);
    });
  });
});
