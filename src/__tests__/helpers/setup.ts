/**
 * Test Setup and Teardown Helpers
 *
 * WHY: Provides utilities for initializing and cleaning up test environment,
 * ensuring isolated tests with predictable state
 */

import { PrismaClient } from '@prisma/client';

/**
 * Mock Prisma Client for testing
 * WHY: Prevents real database operations during tests
 */
export const mockPrismaClient = {
  document: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  graph: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  node: {
    create: jest.fn(),
    createMany: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  edge: {
    create: jest.fn(),
    createMany: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  note: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  quizQuestion: {
    create: jest.fn(),
    createMany: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $transaction: jest.fn(),
};

/**
 * Mock Redis Client for testing
 * WHY: Avoids real Redis operations and allows testing caching logic
 */
export const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  flushall: jest.fn(),
  quit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
};

/**
 * Setup function to run before each test
 * WHY: Ensures clean state for each test
 */
export const setupTest = async (): Promise<void> => {
  // Clear all mock function calls
  jest.clearAllMocks();

  // Reset mock implementations
  Object.values(mockPrismaClient).forEach((mock: any) => {
    if (typeof mock === 'object') {
      Object.values(mock).forEach((fn: any) => {
        if (typeof fn === 'function' && fn.mockReset) {
          fn.mockReset();
        }
      });
    }
  });

  Object.values(mockRedisClient).forEach((fn: any) => {
    if (typeof fn === 'function' && fn.mockReset) {
      fn.mockReset();
    }
  });
};

/**
 * Teardown function to run after each test
 * WHY: Cleans up resources and prevents test pollution
 */
export const teardownTest = async (): Promise<void> => {
  // Clear all timers
  jest.clearAllTimers();

  // Restore all mocks
  jest.restoreAllMocks();
};

/**
 * Setup function for integration tests that need a real database
 * WHY: Some integration tests require actual database operations
 */
export const setupIntegrationTest = async (prisma: PrismaClient): Promise<void> => {
  // Clear test database tables
  // Order matters due to foreign key constraints
  await prisma.quizQuestion.deleteMany({});
  await prisma.note.deleteMany({});
  await prisma.edge.deleteMany({});
  await prisma.node.deleteMany({});
  await prisma.graph.deleteMany({});
  await prisma.document.deleteMany({});
};

/**
 * Teardown function for integration tests
 * WHY: Closes connections and cleans up resources
 */
export const teardownIntegrationTest = async (prisma: PrismaClient): Promise<void> => {
  // Disconnect from database
  await prisma.$disconnect();
};
