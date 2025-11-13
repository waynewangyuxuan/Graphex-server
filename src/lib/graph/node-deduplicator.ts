/**
 * Node Deduplicator Library
 *
 * WHY: Merges duplicate nodes from chunked graph generation to create coherent
 * knowledge graphs. Uses multi-phase algorithm: exact match → acronym detection
 * → fuzzy matching with word overlap prevention.
 *
 * Algorithm Complexity: O(n²) worst case, O(n log n) average with Union-Find
 */

import { Logger } from 'winston';
import {
  DeduplicationInput,
  DeduplicationResult,
  GraphError,
  GraphErrorCode,
} from '../../types/graph.types';

/**
 * Configuration for deduplication thresholds
 */
interface DeduplicationConfig {
  /** Levenshtein distance threshold (0-1, lower = more similar) */
  fuzzyThreshold: number;

  /** Word overlap threshold (0-1, Jaccard similarity) */
  wordOverlapThreshold: number;

  /** Enable acronym detection */
  enableAcronymDetection: boolean;
}

const DEFAULT_CONFIG: DeduplicationConfig = {
  fuzzyThreshold: 0.2, // 80% similarity required (lower threshold = more similar)
  wordOverlapThreshold: 0.5, // 50% word overlap required
  enableAcronymDetection: true,
};

/**
 * Union-Find data structure for efficient merging
 * WHY: Tracks equivalence classes of nodes, prevents duplicate merges
 */
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  /**
   * Initialize a node in the union-find structure
   * Complexity: O(1)
   */
  makeSet(id: string): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  /**
   * Find the root representative of a node (with path compression)
   * Complexity: O(α(n)) amortized, where α is inverse Ackermann function
   */
  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent || parent === id) {
      return id;
    }

    // Path compression: make all nodes point directly to root
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  /**
   * Union two nodes by rank (smaller tree under larger tree)
   * Complexity: O(α(n)) amortized
   */
  union(id1: string, id2: string): void {
    const root1 = this.find(id1);
    const root2 = this.find(id2);

    if (root1 === root2) return;

    const rank1 = this.rank.get(root1) || 0;
    const rank2 = this.rank.get(root2) || 0;

    // Attach smaller tree under larger tree
    if (rank1 < rank2) {
      this.parent.set(root1, root2);
    } else if (rank1 > rank2) {
      this.parent.set(root2, root1);
    } else {
      this.parent.set(root2, root1);
      this.rank.set(root1, rank1 + 1);
    }
  }

  /**
   * Get all equivalence classes
   * Complexity: O(n)
   */
  getGroups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(id);
    }

    return groups;
  }
}

/**
 * Main node deduplicator service
 */
export class NodeDeduplicator {
  private readonly config: DeduplicationConfig;

  constructor(
    private readonly logger: Logger,
    config?: Partial<DeduplicationConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main entry point: deduplicate nodes using multi-phase algorithm
   * Complexity: O(n²) worst case, O(n log n) average
   */
  async deduplicate(input: DeduplicationInput): Promise<DeduplicationResult> {
    const startTime = Date.now();

    // Validate input
    this.validateInput(input);

    // Initialize Union-Find
    const uf = new UnionFind();
    input.nodes.forEach((node) => uf.makeSet(node.id));

    // Track merges by phase
    const mergesByPhase = { exact: 0, acronym: 0, fuzzy: 0 };

    // Phase 1: Exact match (case-insensitive)
    mergesByPhase.exact = this.exactMatch(input.nodes, uf);

    // Phase 2: Acronym detection
    if (this.config.enableAcronymDetection) {
      mergesByPhase.acronym = this.acronymMatch(input.nodes, uf);
    }

    // Phase 3: Fuzzy matching with word overlap
    mergesByPhase.fuzzy = this.fuzzyMatch(input.nodes, uf);

    // Build deduplicated nodes
    const { deduplicatedNodes, mapping } = this.buildResult(input.nodes, uf);

    const statistics = {
      originalCount: input.nodes.length,
      finalCount: deduplicatedNodes.length,
      mergedCount: input.nodes.length - deduplicatedNodes.length,
      mergesByPhase,
    };

    this.logger.info('Node deduplication completed', {
      ...statistics,
      durationMs: Date.now() - startTime,
    });

    return { deduplicatedNodes, mapping, statistics };
  }

  /**
   * Validate input structure
   */
  private validateInput(input: DeduplicationInput): void {
    if (!input.nodes || input.nodes.length === 0) {
      throw new GraphError(
        'Input nodes array is empty',
        GraphErrorCode.DEDUPLICATION_FAILED,
      );
    }

    for (const node of input.nodes) {
      if (!node.id || !node.title) {
        throw new GraphError(
          'Node missing required fields (id, title)',
          GraphErrorCode.DEDUPLICATION_FAILED,
          { node },
        );
      }
    }
  }

  /**
   * Phase 1: Exact match after normalization
   * WHY: Catch simple duplicates like "Machine Learning" vs "machine learning"
   * Complexity: O(n) with hash map
   */
  private exactMatch(
    nodes: Array<{ id: string; title: string }>,
    uf: UnionFind,
  ): number {
    const normalized = new Map<string, string>(); // normalized -> first ID
    let mergeCount = 0;

    for (const node of nodes) {
      const norm = this.normalize(node.title);

      if (normalized.has(norm)) {
        // Merge with existing node
        uf.union(node.id, normalized.get(norm)!);
        mergeCount++;
      } else {
        normalized.set(norm, node.id);
      }
    }

    return mergeCount;
  }

  /**
   * Phase 2: Acronym detection
   * WHY: Match "ML" with "Machine Learning", "NLP" with "Natural Language Processing"
   * Complexity: O(n²) but only for multi-word titles
   */
  private acronymMatch(
    nodes: Array<{ id: string; title: string }>,
    uf: UnionFind,
  ): number {
    let mergeCount = 0;

    // Find potential acronyms (short, uppercase titles)
    const acronyms = nodes.filter((n) => this.isLikelyAcronym(n.title));

    // Find potential full forms (multi-word titles)
    const fullForms = nodes.filter((n) => this.isMultiWord(n.title));

    for (const acronym of acronyms) {
      for (const fullForm of fullForms) {
        // Skip if already merged
        if (uf.find(acronym.id) === uf.find(fullForm.id)) continue;

        if (this.matchesAcronym(acronym.title, fullForm.title)) {
          uf.union(acronym.id, fullForm.id);
          mergeCount++;
          break; // Only merge with first match
        }
      }
    }

    return mergeCount;
  }

  /**
   * Phase 3: Fuzzy matching with word overlap prevention
   * WHY: Match similar titles while preventing false positives
   * Example: "Neural Networks" vs "Social Networks" should NOT match
   * Complexity: O(n²) for all pairs
   */
  private fuzzyMatch(
    nodes: Array<{ id: string; title: string }>,
    uf: UnionFind,
  ): number {
    let mergeCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        // Skip if already merged
        if (uf.find(nodes[i].id) === uf.find(nodes[j].id)) continue;

        const title1 = nodes[i].title;
        const title2 = nodes[j].title;

        // Calculate both Levenshtein and Jaccard similarity
        const levenshtein = this.levenshteinSimilarity(title1, title2);
        const wordOverlap = this.jaccardSimilarity(title1, title2);

        // Both thresholds must pass to merge
        if (
          levenshtein >= 1 - this.config.fuzzyThreshold &&
          wordOverlap >= this.config.wordOverlapThreshold
        ) {
          uf.union(nodes[i].id, nodes[j].id);
          mergeCount++;
        }
      }
    }

    return mergeCount;
  }

  /**
   * Build final deduplicated result
   * WHY: Merge nodes in same equivalence class, preserve best description
   */
  private buildResult(
    nodes: Array<{ id: string; title: string; description?: string }>,
    uf: UnionFind,
  ): {
    deduplicatedNodes: Array<{ id: string; title: string; description?: string }>;
    mapping: Record<string, string>;
  } {
    const groups = uf.getGroups();
    const deduplicatedNodes: Array<{
      id: string;
      title: string;
      description?: string;
    }> = [];
    const mapping: Record<string, string> = {};

    // Create a lookup map for nodes
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    for (const [root, members] of groups.entries()) {
      // Choose best representative (longest title + description)
      const representative = this.chooseBestNode(
        members.map((id) => nodeMap.get(id)!),
      );

      // Use root as the canonical ID
      deduplicatedNodes.push({
        id: root,
        title: representative.title,
        description: representative.description,
      });

      // Map all members to root
      for (const memberId of members) {
        mapping[memberId] = root;
      }
    }

    return { deduplicatedNodes, mapping };
  }

  /**
   * Choose the best node from a group (most informative)
   * WHY: Preserve the most detailed description when merging
   */
  private chooseBestNode(
    nodes: Array<{ id: string; title: string; description?: string }>,
  ): { id: string; title: string; description?: string } {
    return nodes.reduce((best, current) => {
      const bestScore = this.nodeQualityScore(best);
      const currentScore = this.nodeQualityScore(current);
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Calculate quality score for a node (higher = better)
   */
  private nodeQualityScore(node: {
    title: string;
    description?: string;
  }): number {
    let score = 0;
    score += node.title.length; // Longer title = more specific
    score += (node.description?.length || 0) * 2; // Description = very valuable
    return score;
  }

  // ===== Utility Functions =====

  /**
   * Normalize title for exact matching
   */
  private normalize(title: string): string {
    return title.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Check if title is likely an acronym
   */
  private isLikelyAcronym(title: string): boolean {
    const trimmed = title.trim();
    return (
      trimmed.length <= 5 && // Short
      trimmed === trimmed.toUpperCase() && // All caps
      /^[A-Z]+$/.test(trimmed) // Only letters
    );
  }

  /**
   * Check if title has multiple words
   */
  private isMultiWord(title: string): boolean {
    return title.trim().split(/\s+/).length > 1;
  }

  /**
   * Check if acronym matches full form
   * Example: "ML" matches "Machine Learning"
   */
  private matchesAcronym(acronym: string, fullForm: string): boolean {
    const words = fullForm.trim().split(/\s+/);

    // Extract first letter of each word
    const initials = words.map((w) => w[0].toUpperCase()).join('');

    return initials === acronym.toUpperCase();
  }

  /**
   * Calculate Levenshtein similarity (0-1, higher = more similar)
   * Complexity: O(m*n) where m, n are string lengths
   */
  private levenshteinSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(
      str1.toLowerCase(),
      str2.toLowerCase(),
    );
    const maxLen = Math.max(str1.length, str2.length);
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein distance (edit distance)
   * WHY: Measures string similarity by counting minimum edits needed
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    // Create DP table
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    // Initialize base cases
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    // Fill DP table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] =
            1 +
            Math.min(
              dp[i - 1][j], // Delete
              dp[i][j - 1], // Insert
              dp[i - 1][j - 1], // Replace
            );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Calculate Jaccard similarity (word overlap)
   * WHY: Prevents false positives like "Neural Networks" vs "Social Networks"
   * Complexity: O(n + m) where n, m are word counts
   */
  private jaccardSimilarity(str1: string, str2: string): number {
    const words1 = new Set(
      str1
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0),
    );
    const words2 = new Set(
      str2
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0),
    );

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    // Intersection
    const intersection = new Set([...words1].filter((w) => words2.has(w)));

    // Union
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}
