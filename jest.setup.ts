/**
 * Jest Setup File
 * Global setup for all tests
 *
 * WHY: Configure test environment and global mocks to prevent
 * real database/Redis connections in unit tests.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/graphex_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';

// Increase test timeout for integration tests
jest.setTimeout(10000);

/**
 * Global mock for @prisma/client
 *
 * WHY: Prevents unit tests from attempting real database connections.
 * Unit tests should use mocked Prisma client, not real database.
 *
 * For integration tests that need real DB, they can override this mock
 * by importing and using the actual PrismaClient directly.
 */
jest.mock('@prisma/client', () => {
  const { createMockPrismaClient } = require('./src/__tests__/setup/mocks');
  return {
    PrismaClient: jest.fn(() => createMockPrismaClient()),
  };
});

/**
 * Global mock for ioredis
 *
 * WHY: Prevents unit tests from attempting real Redis connections.
 * Unit tests should use mocked Redis client.
 *
 * For integration tests that need real Redis, they can override this mock.
 */
jest.mock('ioredis', () => {
  const { createMockRedisClient } = require('./src/__tests__/setup/mocks');
  return jest.fn(() => createMockRedisClient());
});

/**
 * Global mock for BullMQ
 *
 * WHY: Prevents unit tests from attempting real job queue operations.
 */
jest.mock('bullmq', () => {
  const { createMockQueue, createMockWorker } = require('./src/__tests__/setup/mocks');
  return {
    Queue: jest.fn((name: string) => createMockQueue(name)),
    Worker: jest.fn((name: string) => createMockWorker(name)),
  };
});

// Mock console methods to reduce noise in test output (optional)
// Uncomment if you want cleaner test output
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };

/**
 * Global test setup
 *
 * Runs once before all test suites.
 */
beforeAll(async () => {
  // Add any global setup here if needed
});

/**
 * Global test teardown
 *
 * Runs once after all test suites complete.
 *
 * WHY: Clean up any lingering connections to allow Jest to exit cleanly.
 */
afterAll(async () => {
  // Allow time for async operations to complete
  await new Promise((resolve) => setTimeout(resolve, 100));
});
