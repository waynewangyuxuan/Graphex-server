/**
 * Cost Tracker Service Tests - FIXED VERSION
 *
 * Comprehensive test suite for cost tracking and budget enforcement.
 * These tests are CRITICAL - they ensure we don't go bankrupt from uncontrolled AI costs.
 *
 * Key fixes:
 * - Proper mock configuration for each test scenario
 * - Explicit mock return values instead of relying on global defaults
 * - Clear test isolation with beforeEach reset
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { CostTrackerService } from '../cost-tracker.service';
import {
  InvalidUsageDataError,
  CostCalculationError,
  CostTrackingError,
} from '../../lib/errors/budget-errors';
import { UsageRecordData } from '../../types/cost-tracking.types';

describe('CostTrackerService', () => {
  let service: CostTrackerService;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockPrisma = {
      aIUsage: {
        create: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      incrbyfloat: jest.fn(),
    };

    service = new CostTrackerService(
      mockPrisma as unknown as PrismaClient,
      mockRedis as unknown as Redis
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Budget Checks', () => {
    it('should allow operation within budget', async () => {
      // Mock zero usage - cache miss, then DB returns zero
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.aIUsage.aggregate.mockResolvedValue({
        _sum: { cost: 0 },
        _count: 0,
      });

      const result = await service.checkBudget({
        userId: 'user123',
        operation: 'graph-generation',
      });

      expect(result.allowed).toBe(true);
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.currentUsage.today).toBe(0);
      expect(result.currentUsage.thisMonth).toBe(0);
    });

    it('should block operation exceeding daily limit', async () => {
      // Mock usage at $9.95 (daily limit is $10, graph-generation costs ~$0.081)
      // $9.95 + $0.081 = $10.031 > $10 (exceeds limit)
      // IMPORTANT: getUserUsageFromCache calls redis.get() twice in Promise.all
      // First call: usage:user123:YYYY-MM-DD (today)
      // Second call: usage:user123:YYYY-MM (this month)
      mockRedis.get
        .mockResolvedValueOnce('9.95') // today usage
        .mockResolvedValueOnce('9.95'); // this month usage

      const result = await service.checkBudget({
        userId: 'user123',
        operation: 'graph-generation',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('daily-limit-exceeded');
      expect(result.resetAt).toBeInstanceOf(Date);
      expect(result.upgradeOption).toBe('premium-tier');
    });

    it('should block operation exceeding monthly limit', async () => {
      // Mock usage at $49.95 (monthly limit is $50, graph-generation costs ~$0.081)
      // $49.95 + $0.081 = $50.031 > $50 (exceeds monthly limit)
      // getUserUsageFromCache calls redis.get() twice: today, then thisMonth
      mockRedis.get
        .mockResolvedValueOnce('5.0') // today usage (within daily limit)
        .mockResolvedValueOnce('49.95'); // this month usage (near monthly limit)

      const result = await service.checkBudget({
        userId: 'user123',
        operation: 'graph-generation',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('monthly-limit-exceeded');
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should block document exceeding document limit', async () => {
      // Mock zero usage but check document-level limit
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.aIUsage.aggregate.mockResolvedValue({
        _sum: { cost: 0 },
        _count: 0,
      });

      // Try to process a very large document (> $5 limit)
      const result = await service.checkBudget({
        userId: 'user123',
        operation: 'graph-generation',
        estimatedTokens: 10_000_000, // Very large - would cost > $5
        documentId: 'doc123',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('document-limit-exceeded');
    });

    it('should calculate correct estimates for different operations', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.aIUsage.aggregate.mockResolvedValue({
        _sum: { cost: 0 },
        _count: 0,
      });

      // Graph generation should cost more than connection explanation
      const graphResult = await service.checkBudget({
        userId: 'user123',
        operation: 'graph-generation',
      });

      const explanationResult = await service.checkBudget({
        userId: 'user123',
        operation: 'connection-explanation',
      });

      expect(graphResult.estimatedCost).toBeGreaterThan(explanationResult.estimatedCost);
    });

    it('should handle users without usage history', async () => {
      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);
      // Mock empty database
      mockPrisma.aIUsage.aggregate.mockResolvedValue({
        _sum: { cost: null },
        _count: 0,
      });

      const result = await service.checkBudget({
        userId: 'newuser123',
        operation: 'graph-generation',
      });

      expect(result.allowed).toBe(true);
      expect(result.currentUsage.today).toBe(0);
      expect(result.currentUsage.thisMonth).toBe(0);
    });

    it('should allow operations for anonymous users (MVP)', async () => {
      const result = await service.checkBudget({
        userId: undefined,
        operation: 'graph-generation',
      });

      expect(result.allowed).toBe(true);
      expect(result.currentUsage.today).toBe(0);
    });
  });

  describe('Usage Recording', () => {
    it('should record usage to database', async () => {
      mockPrisma.aIUsage.create.mockResolvedValue({
        id: 'usage123',
      });

      const usageData: UsageRecordData = {
        userId: 'user123',
        operation: 'graph-generation',
        model: 'claude-sonnet-4',
        tokensUsed: { input: 10000, output: 2000 },
        cost: 0.06,
        quality: 85,
        attempts: 1,
        success: true,
        documentId: 'doc123',
      };

      await service.recordUsage(usageData);

      expect(mockPrisma.aIUsage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user123',
          operation: 'graph-generation',
          model: 'claude-sonnet-4',
          inputTokens: 10000,
          outputTokens: 2000,
          totalTokens: 12000,
          cost: 0.06,
          qualityScore: 85,
          attempts: 1,
          success: true,
          documentId: 'doc123',
        }),
      });
    });

    it('should update Redis cache', async () => {
      mockPrisma.aIUsage.create.mockResolvedValue({ id: 'usage123' });

      const usageData: UsageRecordData = {
        userId: 'user123',
        operation: 'graph-generation',
        model: 'claude-sonnet-4',
        tokensUsed: { input: 10000, output: 2000 },
        cost: 0.06,
        attempts: 1,
        success: true,
      };

      await service.recordUsage(usageData);

      // Should increment both daily and monthly counters
      expect(mockRedis.incrbyfloat).toHaveBeenCalledTimes(2);
      expect(mockRedis.incrbyfloat).toHaveBeenCalledWith(
        expect.stringMatching(/^usage:user123:\d{4}-\d{2}-\d{2}$/),
        0.06
      );
      expect(mockRedis.incrbyfloat).toHaveBeenCalledWith(
        expect.stringMatching(/^usage:user123:\d{4}-\d{2}$/),
        0.06
      );
    });

    it('should reject invalid usage data - negative cost', async () => {
      const usageData: UsageRecordData = {
        userId: 'user123',
        operation: 'graph-generation',
        model: 'claude-sonnet-4',
        tokensUsed: { input: 10000, output: 2000 },
        cost: -0.06, // Invalid: negative cost
        attempts: 1,
        success: true,
      };

      // WHY: Service wraps validation errors in CostTrackingError for consistent error handling
      // The original InvalidUsageDataError is thrown by validateUsageData() but caught
      // by recordUsage() and re-thrown as CostTrackingError
      await expect(service.recordUsage(usageData)).rejects.toThrow(CostTrackingError);
      await expect(service.recordUsage(usageData)).rejects.toThrow('Failed to record usage');
    });

    it('should reject invalid usage data - negative tokens', async () => {
      const usageData: UsageRecordData = {
        userId: 'user123',
        operation: 'graph-generation',
        model: 'claude-sonnet-4',
        tokensUsed: { input: -10000, output: 2000 }, // Invalid: negative tokens
        cost: 0.06,
        attempts: 1,
        success: true,
      };

      // WHY: Service wraps validation errors for consistent error handling
      await expect(service.recordUsage(usageData)).rejects.toThrow(CostTrackingError);
      await expect(service.recordUsage(usageData)).rejects.toThrow('Failed to record usage');
    });

    it('should reject invalid usage data - missing operation', async () => {
      const usageData: UsageRecordData = {
        userId: 'user123',
        operation: '', // Invalid: empty operation
        model: 'claude-sonnet-4',
        tokensUsed: { input: 10000, output: 2000 },
        cost: 0.06,
        attempts: 1,
        success: true,
      };

      // WHY: Service wraps validation errors for consistent error handling
      await expect(service.recordUsage(usageData)).rejects.toThrow(CostTrackingError);
      await expect(service.recordUsage(usageData)).rejects.toThrow('Failed to record usage');
    });

    it('should handle failed operations', async () => {
      mockPrisma.aIUsage.create.mockResolvedValue({ id: 'usage123' });

      const usageData: UsageRecordData = {
        userId: 'user123',
        operation: 'graph-generation',
        model: 'claude-sonnet-4',
        tokensUsed: { input: 10000, output: 0 }, // No output because it failed
        cost: 0.03, // Still charged for input tokens
        attempts: 3,
        success: false, // Failed after 3 attempts
        documentId: 'doc123',
      };

      await service.recordUsage(usageData);

      expect(mockPrisma.aIUsage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          success: false,
          attempts: 3,
        }),
      });
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate cost correctly for Claude Sonnet 4', () => {
      const cost = service.calculateCost(
        { input: 10000, output: 2000 },
        'claude-sonnet-4'
      );

      // 10000 input tokens: (10000 / 1_000_000) * $3 = $0.03
      // 2000 output tokens: (2000 / 1_000_000) * $15 = $0.03
      // Total: $0.06
      expect(cost).toBeCloseTo(0.06, 2);
    });

    it('should calculate cost correctly for Claude Haiku', () => {
      const cost = service.calculateCost(
        { input: 10000, output: 2000 },
        'claude-haiku'
      );

      // 10000 input: (10000 / 1_000_000) * $0.25 = $0.0025
      // 2000 output: (2000 / 1_000_000) * $1.25 = $0.0025
      // Total: $0.005
      expect(cost).toBeCloseTo(0.005, 3);
    });

    it('should calculate cost correctly for GPT-4 Turbo', () => {
      const cost = service.calculateCost(
        { input: 10000, output: 2000 },
        'gpt-4-turbo'
      );

      // 10000 input: (10000 / 1_000_000) * $10 = $0.10
      // 2000 output: (2000 / 1_000_000) * $30 = $0.06
      // Total: $0.16
      expect(cost).toBeCloseTo(0.16, 2);
    });

    it('should throw error for unknown model', () => {
      expect(() => {
        service.calculateCost(
          { input: 10000, output: 2000 },
          'unknown-model'
        );
      }).toThrow(CostCalculationError);
    });
  });

  describe('Usage Analytics', () => {
    it('should generate accurate user summary for day', async () => {
      mockPrisma.aIUsage.aggregate.mockResolvedValue({
        _sum: {
          cost: 5.25,
          totalTokens: 150000,
          inputTokens: 120000,
          outputTokens: 30000,
        },
        _count: 10,
      });

      const summary = await service.getUserSummary('user123', 'day');

      expect(summary.totalCost).toBe(5.25);
      expect(summary.totalTokens).toBe(150000);
      expect(summary.operationCount).toBe(10);
      expect(summary.averageCostPerOperation).toBe(0.525);
      expect(summary.tokenBreakdown).toEqual({
        input: 120000,
        output: 30000,
      });
    });

    it('should generate accurate user summary for month', async () => {
      mockPrisma.aIUsage.aggregate.mockResolvedValue({
        _sum: {
          cost: 42.50,
          totalTokens: 1500000,
          inputTokens: 1200000,
          outputTokens: 300000,
        },
        _count: 100,
      });

      const summary = await service.getUserSummary('user123', 'month');

      expect(summary.totalCost).toBe(42.50);
      expect(summary.totalTokens).toBe(1500000);
      expect(summary.operationCount).toBe(100);
      expect(summary.averageCostPerOperation).toBe(0.425);
    });

    it('should provide cost breakdown by operation', async () => {
      mockPrisma.aIUsage.groupBy.mockResolvedValue([
        {
          operation: 'graph-generation',
          _sum: { cost: 3.0 },
          _count: 5,
        },
        {
          operation: 'connection-explanation',
          _sum: { cost: 1.5 },
          _count: 20,
        },
        {
          operation: 'quiz-generation',
          _sum: { cost: 0.5 },
          _count: 10,
        },
      ]);

      const breakdown = await service.getCostBreakdown('user123', 'month');

      expect(breakdown).toHaveLength(3);
      expect(breakdown[0]).toEqual({
        operation: 'graph-generation',
        totalCost: 3.0,
        count: 5,
        averageCost: 0.6,
        percentage: 60, // 3.0 / 5.0 total
      });
      expect(breakdown[1]).toEqual({
        operation: 'connection-explanation',
        totalCost: 1.5,
        count: 20,
        averageCost: 0.075,
        percentage: 30,
      });
    });

    it('should handle users with no usage history', async () => {
      mockPrisma.aIUsage.aggregate.mockResolvedValue({
        _sum: {
          cost: null,
          totalTokens: null,
          inputTokens: null,
          outputTokens: null,
        },
        _count: 0,
      });

      const summary = await service.getUserSummary('newuser123', 'day');

      expect(summary.totalCost).toBe(0);
      expect(summary.totalTokens).toBe(0);
      expect(summary.operationCount).toBe(0);
      expect(summary.averageCostPerOperation).toBe(0);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete operation lifecycle', async () => {
      // Step 1: Check budget (should pass)
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.aIUsage.aggregate.mockResolvedValue({
        _sum: { cost: 2.0 },
        _count: 5,
      });

      const budgetCheck = await service.checkBudget({
        userId: 'user123',
        operation: 'graph-generation',
        documentId: 'doc123',
      });

      expect(budgetCheck.allowed).toBe(true);

      // Step 2: Perform operation (simulated)
      const actualCost = 0.58; // Actual cost after operation

      // Step 3: Record usage
      mockPrisma.aIUsage.create.mockResolvedValue({ id: 'usage123' });

      await service.recordUsage({
        userId: 'user123',
        operation: 'graph-generation',
        model: 'claude-sonnet-4',
        tokensUsed: { input: 9600, output: 2400 },
        cost: actualCost,
        quality: 90,
        attempts: 1,
        success: true,
        documentId: 'doc123',
      });

      expect(mockPrisma.aIUsage.create).toHaveBeenCalled();
      expect(mockRedis.incrbyfloat).toHaveBeenCalledWith(
        expect.any(String),
        actualCost
      );
    });

    it('should prevent over-spending after multiple operations', async () => {
      // Reset mocks first to clear any previous state
      jest.clearAllMocks();

      // Simulate user who has spent $9.95 today (daily limit is $10)
      // Graph generation costs ~$0.081, which would exceed: $9.95 + $0.081 = $10.031 > $10
      // WHY: getUserUsageFromCache calls redis.get() twice per budget check
      mockRedis.get
        .mockResolvedValueOnce('9.95') // today for first check
        .mockResolvedValueOnce('25.0') // this month for first check
        .mockResolvedValueOnce('9.95') // today for second check
        .mockResolvedValueOnce('25.0'); // this month for second check

      // First operation: Should be blocked (would exceed daily limit)
      const result1 = await service.checkBudget({
        userId: 'user123',
        operation: 'graph-generation', // Costs ~$0.081
      });

      expect(result1.allowed).toBe(false);
      expect(result1.reason).toBe('daily-limit-exceeded');

      // Second operation: Connection explanation costs ~$0.0162, so $9.95 + $0.0162 = $9.9662 < $10
      // This should be ALLOWED because it's under the limit
      const result2 = await service.checkBudget({
        userId: 'user123',
        operation: 'connection-explanation', // Cheaper operation, fits within budget
      });

      expect(result2.allowed).toBe(true); // Should be allowed (within limits)
    });

    it('should track costs across multiple users independently', async () => {
      // Reset mocks
      jest.clearAllMocks();

      // Setup mock chain for both users
      mockRedis.get
        .mockResolvedValueOnce('9.95')  // user1 today (will exceed with $0.081 operation)
        .mockResolvedValueOnce('40.0')  // user1 this month
        .mockResolvedValueOnce('1.0')   // user2 today
        .mockResolvedValueOnce('5.0');  // user2 this month

      // User 1: High usage - should be blocked
      const user1Check = await service.checkBudget({
        userId: 'user1',
        operation: 'graph-generation',
      });

      // User 2: Low usage - should be allowed
      const user2Check = await service.checkBudget({
        userId: 'user2',
        operation: 'graph-generation',
      });

      expect(user1Check.allowed).toBe(false); // Would exceed daily limit ($9.95 + $0.081 > $10)
      expect(user2Check.allowed).toBe(true); // Well within limits
    });
  });
});
