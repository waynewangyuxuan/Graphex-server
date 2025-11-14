/**
 * Graph Types Tests - Enhanced Node Structure
 *
 * Tests for the enhanced node structure with nodeType and summary fields:
 * 1. NodeType enum validation
 * 2. GraphNode interface type safety
 * 3. DeduplicationInput/Result type safety
 * 4. AIGraphOutput compatibility
 */

import { NodeType, GraphNode, DeduplicationInput, DeduplicationResult } from '../../../types/graph.types';

describe('NodeType Enum', () => {
  describe('Core Knowledge Types', () => {
    it('should have concept type', () => {
      expect(NodeType.CONCEPT).toBe('concept');
    });

    it('should have definition type', () => {
      expect(NodeType.DEFINITION).toBe('definition');
    });

    it('should have theory type', () => {
      expect(NodeType.THEORY).toBe('theory');
    });
  });

  describe('Evidence & Support Types', () => {
    it('should have fact type', () => {
      expect(NodeType.FACT).toBe('fact');
    });

    it('should have evidence type', () => {
      expect(NodeType.EVIDENCE).toBe('evidence');
    });

    it('should have example type', () => {
      expect(NodeType.EXAMPLE).toBe('example');
    });

    it('should have statistic type', () => {
      expect(NodeType.STATISTIC).toBe('statistic');
    });
  });

  describe('Argumentation Types', () => {
    it('should have argument type', () => {
      expect(NodeType.ARGUMENT).toBe('argument');
    });

    it('should have premise type', () => {
      expect(NodeType.PREMISE).toBe('premise');
    });

    it('should have conclusion type', () => {
      expect(NodeType.CONCLUSION).toBe('conclusion');
    });

    it('should have counterargument type', () => {
      expect(NodeType.COUNTERARGUMENT).toBe('counterargument');
    });
  });

  describe('Actors & Entities Types', () => {
    it('should have person type', () => {
      expect(NodeType.PERSON).toBe('person');
    });

    it('should have organization type', () => {
      expect(NodeType.ORGANIZATION).toBe('organization');
    });

    it('should have place type', () => {
      expect(NodeType.PLACE).toBe('place');
    });

    it('should have event type', () => {
      expect(NodeType.EVENT).toBe('event');
    });
  });

  describe('Process & Method Types', () => {
    it('should have method type', () => {
      expect(NodeType.METHOD).toBe('method');
    });

    it('should have process type', () => {
      expect(NodeType.PROCESS).toBe('process');
    });

    it('should have mechanism type', () => {
      expect(NodeType.MECHANISM).toBe('mechanism');
    });

    it('should have algorithm type', () => {
      expect(NodeType.ALGORITHM).toBe('algorithm');
    });
  });

  describe('Comparison & Analysis Types', () => {
    it('should have comparison type', () => {
      expect(NodeType.COMPARISON).toBe('comparison');
    });

    it('should have classification type', () => {
      expect(NodeType.CLASSIFICATION).toBe('classification');
    });

    it('should have analysis type', () => {
      expect(NodeType.ANALYSIS).toBe('analysis');
    });
  });

  describe('Problem Solving Types', () => {
    it('should have question type', () => {
      expect(NodeType.QUESTION).toBe('question');
    });

    it('should have problem type', () => {
      expect(NodeType.PROBLEM).toBe('problem');
    });

    it('should have solution type', () => {
      expect(NodeType.SOLUTION).toBe('solution');
    });
  });

  describe('Complete Enum Coverage', () => {
    it('should have exactly 25 node types defined', () => {
      const nodeTypeValues = Object.values(NodeType);
      expect(nodeTypeValues).toHaveLength(25);
    });

    it('should have all types as lowercase strings', () => {
      const nodeTypeValues = Object.values(NodeType);
      for (const value of nodeTypeValues) {
        expect(typeof value).toBe('string');
        expect(value).toBe(value.toLowerCase());
      }
    });

    it('should have unique values', () => {
      const nodeTypeValues = Object.values(NodeType);
      const uniqueValues = new Set(nodeTypeValues);
      expect(uniqueValues.size).toBe(nodeTypeValues.length);
    });
  });
});

describe('GraphNode Interface', () => {
  describe('Required Fields', () => {
    it('should accept minimal valid node with id and title only', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'Machine Learning',
      };

      expect(node.id).toBe('node_1');
      expect(node.title).toBe('Machine Learning');
    });

    it('should accept node with all enhanced fields', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'Machine Learning',
        description: 'A subset of artificial intelligence',
        nodeType: NodeType.CONCEPT,
        summary: 'Machine learning is a method of data analysis that automates analytical model building. It is a branch of artificial intelligence based on the idea that systems can learn from data, identify patterns and make decisions with minimal human intervention.',
      };

      expect(node.nodeType).toBe(NodeType.CONCEPT);
      expect(node.summary).toBeDefined();
      expect(node.summary?.split('.').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('NodeType Field', () => {
    it('should accept NodeType enum values', () => {
      const conceptNode: GraphNode = {
        id: 'node_1',
        title: 'Neural Networks',
        nodeType: NodeType.CONCEPT,
      };

      const methodNode: GraphNode = {
        id: 'node_2',
        title: 'Backpropagation',
        nodeType: NodeType.METHOD,
      };

      expect(conceptNode.nodeType).toBe('concept');
      expect(methodNode.nodeType).toBe('method');
    });

    it('should accept string values for nodeType', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'Custom Type',
        nodeType: 'custom-type',
      };

      expect(node.nodeType).toBe('custom-type');
    });

    it('should allow undefined nodeType', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'No Type',
      };

      expect(node.nodeType).toBeUndefined();
    });
  });

  describe('Summary Field', () => {
    it('should accept valid 2-sentence summary', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'Deep Learning',
        summary: 'Deep learning is a subset of machine learning that uses neural networks with multiple layers. It excels at learning hierarchical representations of data for complex pattern recognition tasks.',
      };

      expect(node.summary).toBeDefined();
      expect(node.summary?.split('.').filter(s => s.trim()).length).toBe(2);
    });

    it('should allow undefined summary', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'No Summary',
      };

      expect(node.summary).toBeUndefined();
    });

    it('should allow empty string summary', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'Empty Summary',
        summary: '',
      };

      expect(node.summary).toBe('');
    });
  });

  describe('Legacy Compatibility', () => {
    it('should still support legacy description field', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'Legacy Node',
        description: 'Old description field',
      };

      expect(node.description).toBe('Old description field');
    });

    it('should support both description and summary', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'Hybrid Node',
        description: 'Legacy description',
        summary: 'New summary field with context. It provides more detailed information.',
      };

      expect(node.description).toBeDefined();
      expect(node.summary).toBeDefined();
    });
  });

  describe('Complete Node Structure', () => {
    it('should accept fully populated node with all fields', () => {
      const node: GraphNode = {
        id: 'A',
        title: 'Supervised Learning',
        description: 'Learning from labeled data',
        nodeType: NodeType.METHOD,
        summary: 'Supervised learning is a machine learning paradigm where models learn from labeled training data. The algorithm learns to map inputs to outputs based on example input-output pairs provided during training.',
        sourceReferences: [
          {
            start: 100,
            end: 250,
            text: 'Supervised learning uses labeled data to train models...',
          },
        ],
        metadata: {
          documentRefs: [
            {
              start: 100,
              end: 250,
              text: 'Supervised learning uses labeled data to train models...',
            },
          ],
          confidence: 0.95,
        },
      };

      expect(node.id).toBe('A');
      expect(node.title).toBe('Supervised Learning');
      expect(node.nodeType).toBe(NodeType.METHOD);
      expect(node.summary).toBeDefined();
      expect(node.sourceReferences).toHaveLength(1);
      expect(node.metadata).toBeDefined();
    });
  });
});

describe('DeduplicationInput Interface', () => {
  it('should accept nodes with enhanced fields', () => {
    const input: DeduplicationInput = {
      nodes: [
        {
          id: 'node_1',
          title: 'Machine Learning',
          description: 'ML description',
          nodeType: NodeType.CONCEPT,
          summary: 'Machine learning enables systems to learn from data. It automates analytical model building through pattern recognition.',
        },
        {
          id: 'node_2',
          title: 'Deep Learning',
          description: 'DL description',
          nodeType: NodeType.METHOD,
          summary: 'Deep learning uses multi-layer neural networks. It excels at hierarchical feature learning.',
        },
      ],
    };

    expect(input.nodes).toHaveLength(2);
    expect(input.nodes[0].nodeType).toBe(NodeType.CONCEPT);
    expect(input.nodes[0].summary).toBeDefined();
    expect(input.nodes[1].nodeType).toBe(NodeType.METHOD);
    expect(input.nodes[1].summary).toBeDefined();
  });

  it('should accept nodes without enhanced fields', () => {
    const input: DeduplicationInput = {
      nodes: [
        {
          id: 'node_1',
          title: 'Node A',
        },
        {
          id: 'node_2',
          title: 'Node B',
          description: 'Description only',
        },
      ],
    };

    expect(input.nodes).toHaveLength(2);
    expect(input.nodes[0].nodeType).toBeUndefined();
    expect(input.nodes[0].summary).toBeUndefined();
  });

  it('should accept mixed nodes with and without enhanced fields', () => {
    const input: DeduplicationInput = {
      nodes: [
        {
          id: 'node_1',
          title: 'Enhanced Node',
          nodeType: NodeType.CONCEPT,
          summary: 'This is an enhanced node. It has all new fields.',
        },
        {
          id: 'node_2',
          title: 'Legacy Node',
          description: 'Old format',
        },
      ],
    };

    expect(input.nodes).toHaveLength(2);
    expect(input.nodes[0].nodeType).toBeDefined();
    expect(input.nodes[1].nodeType).toBeUndefined();
  });
});

describe('DeduplicationResult Interface', () => {
  it('should preserve enhanced fields in deduplicated nodes', () => {
    const result: DeduplicationResult = {
      deduplicatedNodes: [
        {
          id: 'merged_1',
          title: 'Machine Learning',
          description: 'Combined description',
          nodeType: NodeType.CONCEPT,
          summary: 'Machine learning is an AI subset. It enables automated learning from data.',
        },
      ],
      mapping: {
        node_1: 'merged_1',
        node_2: 'merged_1',
      },
      statistics: {
        originalCount: 2,
        finalCount: 1,
        mergedCount: 1,
        mergesByPhase: {
          exact: 0,
          acronym: 0,
          fuzzy: 1,
        },
      },
    };

    expect(result.deduplicatedNodes).toHaveLength(1);
    expect(result.deduplicatedNodes[0].nodeType).toBe(NodeType.CONCEPT);
    expect(result.deduplicatedNodes[0].summary).toBeDefined();
    expect(result.statistics.mergedCount).toBe(1);
  });

  it('should accept results without enhanced fields', () => {
    const result: DeduplicationResult = {
      deduplicatedNodes: [
        {
          id: 'node_1',
          title: 'Simple Node',
        },
      ],
      mapping: {},
      statistics: {
        originalCount: 1,
        finalCount: 1,
        mergedCount: 0,
        mergesByPhase: {
          exact: 0,
          acronym: 0,
          fuzzy: 0,
        },
      },
    };

    expect(result.deduplicatedNodes[0].nodeType).toBeUndefined();
    expect(result.deduplicatedNodes[0].summary).toBeUndefined();
  });
});

describe('Type Safety and Edge Cases', () => {
  describe('NodeType String Compatibility', () => {
    it('should allow custom string for nodeType while maintaining type safety', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'Custom Node',
        nodeType: 'custom-category',
      };

      expect(typeof node.nodeType).toBe('string');
    });

    it('should allow NodeType enum for nodeType', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'Enum Node',
        nodeType: NodeType.ANALYSIS,
      };

      expect(node.nodeType).toBe('analysis');
    });
  });

  describe('Optional Field Behavior', () => {
    it('should handle undefined optional fields gracefully', () => {
      const node: GraphNode = {
        id: 'node_1',
        title: 'Minimal Node',
        description: undefined,
        nodeType: undefined,
        summary: undefined,
      };

      expect(node.description).toBeUndefined();
      expect(node.nodeType).toBeUndefined();
      expect(node.summary).toBeUndefined();
    });

    it('should differentiate between undefined and empty string', () => {
      const nodeUndefined: GraphNode = {
        id: 'node_1',
        title: 'Node 1',
        summary: undefined,
      };

      const nodeEmpty: GraphNode = {
        id: 'node_2',
        title: 'Node 2',
        summary: '',
      };

      expect(nodeUndefined.summary).toBeUndefined();
      expect(nodeEmpty.summary).toBe('');
      expect(nodeEmpty.summary).not.toBeUndefined();
    });
  });

  describe('Array Type Safety', () => {
    it('should enforce array types for nodes in DeduplicationInput', () => {
      const input: DeduplicationInput = {
        nodes: [],
      };

      expect(Array.isArray(input.nodes)).toBe(true);
    });

    it('should type-check node objects in arrays', () => {
      const nodes: GraphNode[] = [
        { id: '1', title: 'Node 1', nodeType: NodeType.CONCEPT },
        { id: '2', title: 'Node 2', summary: 'Summary here. Second sentence.' },
      ];

      expect(nodes).toHaveLength(2);
      expect(nodes[0].nodeType).toBe(NodeType.CONCEPT);
      expect(nodes[1].summary).toBeDefined();
    });
  });
});
