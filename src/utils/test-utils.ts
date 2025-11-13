/**
 * Test Utilities
 *
 * Common utilities for testing including mock factories and helpers.
 */

/**
 * Create a mock Winston logger for testing
 *
 * WHY: Tests shouldn't produce console output, but services expect a logger.
 * This provides a silent logger that can be spied on if needed.
 */
export function createMockLogger() {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
  };
}

/**
 * Create a mock Prisma client for testing
 */
export function createMockPrisma() {
  return {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    aIUsage: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    graph: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    node: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    edge: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

/**
 * Sleep helper for testing delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a spy that tracks call order
 */
export function createCallOrderSpy() {
  const calls: Array<{ name: string; args: any[]; timestamp: number }> = [];

  return {
    track(name: string, ...args: any[]) {
      calls.push({ name, args, timestamp: Date.now() });
    },
    getCalls() {
      return calls;
    },
    getCallNames() {
      return calls.map(c => c.name);
    },
    reset() {
      calls.length = 0;
    },
  };
}
