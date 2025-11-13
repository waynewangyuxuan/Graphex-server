/**
 * Graph Validator with Auto-Fix
 *
 * WHY: Validates graph structure and automatically fixes common issues like
 * orphaned edges, duplicate edges, and syntax errors. Ensures graphs are
 * ready for visualization and storage.
 *
 * Algorithm Complexity: O(n + m) where n = nodes, m = edges
 */

import { Logger } from 'winston';
import {
  GraphData,
  ValidationResult,
  ValidationError,
  ValidationErrorCode,
  ValidationFix,
  ValidationFixType,
  ValidationStatistics,
  GraphError,
  GraphErrorCode,
} from '../../types/graph.types';

/**
 * Configuration for validation rules
 */
interface ValidatorConfig {
  /** Minimum nodes required (inclusive) */
  minNodes: number;

  /** Maximum nodes allowed (inclusive) */
  maxNodes: number;

  /** Auto-fix issues when possible */
  autoFix: boolean;

  /** Remove isolated nodes (nodes with no connections) */
  removeIsolatedNodes: boolean;
}

const DEFAULT_CONFIG: ValidatorConfig = {
  minNodes: 7,
  maxNodes: 15,
  autoFix: true,
  removeIsolatedNodes: false, // Keep isolated nodes by default (intentional)
};

/**
 * Main graph validator service
 */
export class GraphValidator {
  private readonly config: ValidatorConfig;

  constructor(
    private readonly logger: Logger,
    config?: Partial<ValidatorConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main entry point: validate and optionally auto-fix graph
   * Complexity: O(n + m) where n = nodes, m = edges
   */
  async validate(graph: GraphData): Promise<ValidationResult> {
    const startTime = Date.now();

    // Validate basic structure
    this.validateStructure(graph);

    // Collect all errors and warnings
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    const fixes: ValidationFix[] = [];

    // Initialize statistics
    const statistics: ValidationStatistics = {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      orphanedEdgesRemoved: 0,
      duplicateEdgesRemoved: 0,
      nodesRemoved: 0,
      selfReferencesRemoved: 0,
    };

    // Make a working copy for auto-fix
    let workingGraph = this.config.autoFix ? this.cloneGraph(graph) : graph;

    // Run validation checks (except node count which may be fixable)
    this.checkNodeIds(workingGraph, errors);
    this.checkEdgeFields(workingGraph, errors);

    // Check for issues that can be auto-fixed
    const orphanedEdges = this.findOrphanedEdges(workingGraph);
    const duplicateEdges = this.findDuplicateEdges(workingGraph);
    const selfReferences = this.findSelfReferences(workingGraph);

    // Check if we need to trim nodes
    const needsNodeTrimming = graph.nodes.length > this.config.maxNodes;

    const hasFixableIssues =
      orphanedEdges.length > 0 ||
      duplicateEdges.length > 0 ||
      selfReferences.length > 0 ||
      needsNodeTrimming;

    if (orphanedEdges.length > 0) {
      errors.push({
        code: ValidationErrorCode.ORPHANED_EDGE,
        message: `Found ${orphanedEdges.length} orphaned edges (reference non-existent nodes)`,
        severity: 'error',
        details: { count: orphanedEdges.length },
      });
    }

    if (duplicateEdges.length > 0) {
      warnings.push(
        `Found ${duplicateEdges.length} duplicate edges (same source + target + relationship)`,
      );
    }

    if (selfReferences.length > 0) {
      warnings.push(
        `Found ${selfReferences.length} self-referencing edges (node points to itself)`,
      );
    }

    // Apply auto-fix if enabled and issues found (including warnings)
    if (this.config.autoFix && hasFixableIssues) {
      const fixResult = this.applyFixes(workingGraph, {
        orphanedEdges,
        duplicateEdges,
        selfReferences,
      });

      workingGraph = fixResult.graph;
      fixes.push(...fixResult.fixes);

      // Update statistics
      statistics.orphanedEdgesRemoved = orphanedEdges.length;
      statistics.duplicateEdgesRemoved = duplicateEdges.length;
      statistics.selfReferencesRemoved = selfReferences.length;
      statistics.nodesRemoved = fixResult.nodesRemoved;
      statistics.nodeCount = workingGraph.nodes.length;
      statistics.edgeCount = workingGraph.edges.length;
    }

    // Check for isolated nodes (warning only)
    const isolatedNodes = this.findIsolatedNodes(workingGraph);
    if (isolatedNodes.length > 0 && !this.config.removeIsolatedNodes) {
      warnings.push(
        `Found ${isolatedNodes.length} isolated nodes (no connections)`,
      );
    }

    // Check node count AFTER auto-fix (so we can report on fixed graph)
    this.checkNodeCount(workingGraph, errors, warnings);

    // Validate Mermaid syntax if present
    if (workingGraph.mermaidCode) {
      const mermaidErrors = this.validateMermaidSyntax(workingGraph.mermaidCode);
      if (mermaidErrors.length > 0) {
        errors.push(...mermaidErrors);

        // Try to fix Mermaid syntax
        if (this.config.autoFix) {
          const fixed = this.fixMermaidSyntax(workingGraph);
          if (fixed) {
            workingGraph.mermaidCode = fixed;
            fixes.push({
              type: ValidationFixType.FIXED_MERMAID_SYNTAX,
              description: 'Fixed basic Mermaid syntax errors',
            });
          }
        }
      }
    }

    const isValid = errors.length === 0;

    const result: ValidationResult = {
      isValid,
      errors,
      warnings,
      fixedGraph:
        this.config.autoFix && (hasFixableIssues || !isValid)
          ? workingGraph
          : undefined,
      fixes,
      statistics,
    };

    this.logger.info('Graph validation completed', {
      isValid,
      errorCount: errors.length,
      warningCount: warnings.length,
      fixesApplied: fixes.length,
      durationMs: Date.now() - startTime,
    });

    return result;
  }

  /**
   * Validate basic graph structure
   */
  private validateStructure(graph: GraphData): void {
    if (!graph.nodes || !Array.isArray(graph.nodes)) {
      throw new GraphError(
        'Graph nodes must be an array',
        GraphErrorCode.INVALID_GRAPH_STRUCTURE,
      );
    }

    if (!graph.edges || !Array.isArray(graph.edges)) {
      throw new GraphError(
        'Graph edges must be an array',
        GraphErrorCode.INVALID_GRAPH_STRUCTURE,
      );
    }
  }

  /**
   * Check all nodes have valid IDs
   */
  private checkNodeIds(graph: GraphData, errors: ValidationError[]): void {
    const nodeIds = new Set<string>();

    for (let i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];

      if (!node.id || typeof node.id !== 'string' || node.id.trim() === '') {
        errors.push({
          code: ValidationErrorCode.MISSING_NODE_ID,
          message: `Node at index ${i} missing valid ID`,
          severity: 'error',
          details: { nodeIndex: i, node },
        });
      }

      if (nodeIds.has(node.id)) {
        errors.push({
          code: ValidationErrorCode.MISSING_NODE_ID,
          message: `Duplicate node ID: ${node.id}`,
          severity: 'error',
          details: { nodeId: node.id },
        });
      }

      nodeIds.add(node.id);
    }
  }

  /**
   * Check all edges have required fields
   */
  private checkEdgeFields(graph: GraphData, errors: ValidationError[]): void {
    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];

      if (!edge.from || typeof edge.from !== 'string') {
        errors.push({
          code: ValidationErrorCode.MISSING_EDGE_FIELD,
          message: `Edge at index ${i} missing 'from' field`,
          severity: 'error',
          details: { edgeIndex: i, edge },
        });
      }

      if (!edge.to || typeof edge.to !== 'string') {
        errors.push({
          code: ValidationErrorCode.MISSING_EDGE_FIELD,
          message: `Edge at index ${i} missing 'to' field`,
          severity: 'error',
          details: { edgeIndex: i, edge },
        });
      }

      if (!edge.relationship || typeof edge.relationship !== 'string') {
        errors.push({
          code: ValidationErrorCode.MISSING_EDGE_FIELD,
          message: `Edge at index ${i} missing 'relationship' field`,
          severity: 'error',
          details: { edgeIndex: i, edge },
        });
      }
    }
  }

  /**
   * Check node count is within bounds
   */
  private checkNodeCount(
    graph: GraphData,
    errors: ValidationError[],
    warnings: string[],
  ): void {
    const count = graph.nodes.length;

    if (count < this.config.minNodes) {
      errors.push({
        code: ValidationErrorCode.TOO_FEW_NODES,
        message: `Graph has too few nodes (${count} < ${this.config.minNodes})`,
        severity: 'error',
        details: { count, minNodes: this.config.minNodes },
      });
    }

    if (count > this.config.maxNodes) {
      errors.push({
        code: ValidationErrorCode.TOO_MANY_NODES,
        message: `Graph has too many nodes (${count} > ${this.config.maxNodes})`,
        severity: 'error',
        details: { count, maxNodes: this.config.maxNodes },
      });
    }
  }

  /**
   * Find edges that reference non-existent nodes
   * Complexity: O(m) where m = edges
   */
  private findOrphanedEdges(graph: GraphData): number[] {
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const orphanedIndices: number[] = [];

    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];

      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        orphanedIndices.push(i);
      }
    }

    return orphanedIndices;
  }

  /**
   * Find duplicate edges (same source + target + relationship)
   * Complexity: O(m) where m = edges
   */
  private findDuplicateEdges(graph: GraphData): number[] {
    const seen = new Set<string>();
    const duplicateIndices: number[] = [];

    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];
      const key = `${edge.from}|${edge.to}|${edge.relationship}`;

      if (seen.has(key)) {
        duplicateIndices.push(i);
      } else {
        seen.add(key);
      }
    }

    return duplicateIndices;
  }

  /**
   * Find edges where from === to (self-references)
   * Complexity: O(m) where m = edges
   */
  private findSelfReferences(graph: GraphData): number[] {
    const selfRefIndices: number[] = [];

    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];

      if (edge.from === edge.to) {
        selfRefIndices.push(i);
      }
    }

    return selfRefIndices;
  }

  /**
   * Find nodes with no incoming or outgoing edges
   * Complexity: O(n + m) where n = nodes, m = edges
   */
  private findIsolatedNodes(graph: GraphData): string[] {
    const connected = new Set<string>();

    for (const edge of graph.edges) {
      connected.add(edge.from);
      connected.add(edge.to);
    }

    return graph.nodes.filter((n) => !connected.has(n.id)).map((n) => n.id);
  }

  /**
   * Apply all fixes to the graph
   */
  private applyFixes(
    graph: GraphData,
    issues: {
      orphanedEdges: number[];
      duplicateEdges: number[];
      selfReferences: number[];
    },
  ): { graph: GraphData; fixes: ValidationFix[]; nodesRemoved: number } {
    const fixes: ValidationFix[] = [];
    let nodesRemoved = 0;

    // Combine all indices to remove (in reverse order to avoid index shifting)
    const edgesToRemove = new Set([
      ...issues.orphanedEdges,
      ...issues.duplicateEdges,
      ...issues.selfReferences,
    ]);

    if (edgesToRemove.size > 0) {
      const originalEdgeCount = graph.edges.length;
      graph.edges = graph.edges.filter((_, i) => !edgesToRemove.has(i));

      if (issues.orphanedEdges.length > 0) {
        fixes.push({
          type: ValidationFixType.REMOVED_ORPHANED_EDGE,
          description: `Removed ${issues.orphanedEdges.length} orphaned edges`,
          details: { count: issues.orphanedEdges.length },
        });
      }

      if (issues.duplicateEdges.length > 0) {
        fixes.push({
          type: ValidationFixType.REMOVED_DUPLICATE_EDGE,
          description: `Removed ${issues.duplicateEdges.length} duplicate edges`,
          details: { count: issues.duplicateEdges.length },
        });
      }

      if (issues.selfReferences.length > 0) {
        fixes.push({
          type: ValidationFixType.REMOVED_SELF_REFERENCE,
          description: `Removed ${issues.selfReferences.length} self-referencing edges`,
          details: { count: issues.selfReferences.length },
        });
      }
    }

    // Trim excess nodes if needed
    if (graph.nodes.length > this.config.maxNodes) {
      const nodesToKeep = this.selectTopNodes(graph, this.config.maxNodes);
      const removedCount = graph.nodes.length - nodesToKeep.length;
      nodesRemoved = removedCount;

      graph.nodes = nodesToKeep;

      // Remove edges that now reference removed nodes
      const nodeIds = new Set(graph.nodes.map((n) => n.id));
      graph.edges = graph.edges.filter(
        (e) => nodeIds.has(e.from) && nodeIds.has(e.to),
      );

      fixes.push({
        type: ValidationFixType.REMOVED_EXCESS_NODES,
        description: `Removed ${removedCount} excess nodes (trimmed to top ${this.config.maxNodes})`,
        details: { count: removedCount },
      });
    }

    return { graph, fixes, nodesRemoved };
  }

  /**
   * Select top N nodes by connection count
   * WHY: Keep most connected nodes when trimming
   */
  private selectTopNodes(graph: GraphData, topN: number): typeof graph.nodes {
    // Count connections for each node
    const connectionCounts = new Map<string, number>();

    for (const node of graph.nodes) {
      connectionCounts.set(node.id, 0);
    }

    for (const edge of graph.edges) {
      connectionCounts.set(
        edge.from,
        (connectionCounts.get(edge.from) || 0) + 1,
      );
      connectionCounts.set(edge.to, (connectionCounts.get(edge.to) || 0) + 1);
    }

    // Sort nodes by connection count (descending)
    const sorted = [...graph.nodes].sort((a, b) => {
      const countA = connectionCounts.get(a.id) || 0;
      const countB = connectionCounts.get(b.id) || 0;
      return countB - countA;
    });

    return sorted.slice(0, topN);
  }

  /**
   * Validate Mermaid syntax (basic checks)
   */
  private validateMermaidSyntax(mermaidCode: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for basic structure
    if (!mermaidCode.trim().startsWith('graph')) {
      errors.push({
        code: ValidationErrorCode.INVALID_MERMAID_SYNTAX,
        message: 'Mermaid code must start with "graph" directive',
        severity: 'error',
      });
    }

    // Check for balanced brackets/quotes
    const openBrackets = (mermaidCode.match(/\[/g) || []).length;
    const closeBrackets = (mermaidCode.match(/]/g) || []).length;

    if (openBrackets !== closeBrackets) {
      errors.push({
        code: ValidationErrorCode.INVALID_MERMAID_SYNTAX,
        message: 'Unbalanced brackets in Mermaid code',
        severity: 'error',
        details: { openBrackets, closeBrackets },
      });
    }

    return errors;
  }

  /**
   * Fix basic Mermaid syntax errors
   * WHY: Attempt to salvage malformed Mermaid code
   */
  private fixMermaidSyntax(graph: GraphData): string | null {
    try {
      // Regenerate Mermaid from graph structure
      let mermaid = 'graph TD\n';

      for (const edge of graph.edges) {
        const fromNode = graph.nodes.find((n) => n.id === edge.from);
        const toNode = graph.nodes.find((n) => n.id === edge.to);

        if (fromNode && toNode) {
          const fromLabel = this.sanitizeMermaidLabel(fromNode.title);
          const toLabel = this.sanitizeMermaidLabel(toNode.title);
          const relationship = this.sanitizeMermaidLabel(edge.relationship);

          mermaid += `  ${edge.from}[${fromLabel}] -->|${relationship}| ${edge.to}[${toLabel}]\n`;
        }
      }

      return mermaid;
    } catch (error) {
      this.logger.warn('Failed to fix Mermaid syntax', { error });
      return null;
    }
  }

  /**
   * Sanitize label for Mermaid syntax
   */
  private sanitizeMermaidLabel(label: string): string {
    return label.replace(/[[\]|"]/g, '').trim();
  }

  /**
   * Clone graph for safe mutation
   */
  private cloneGraph(graph: GraphData): GraphData {
    return {
      nodes: graph.nodes.map((n) => ({ ...n })),
      edges: graph.edges.map((e) => ({ ...e })),
      mermaidCode: graph.mermaidCode,
      metadata: graph.metadata ? { ...graph.metadata } : undefined,
    };
  }
}
