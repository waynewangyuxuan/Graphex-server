/**
 * Global Test Mocks
 *
 * Centralized mocking setup for all tests.
 * These mocks prevent tests from making real database or Redis connections.
 *
 * WHY: Unit tests should NEVER depend on external infrastructure.
 * Mocks provide fast, isolated, and predictable test execution.
 *
 * @see REGULATION.md Testing Principles
 */

/**
 * Mock Prisma Client
 *
 * WHY: Prevents real database connections in unit tests.
 * Each test can customize the mock behavior using jest.spyOn() or mockReturnValue().
 */
export const createMockPrismaClient = () => ({
  // Document operations
  document: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },

  // Graph operations
  graph: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },

  // AI Usage tracking
  aIUsage: {
    create: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
  },

  // Connection operations
  connection: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },

  // Quiz operations
  quiz: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },

  // Transaction support
  $transaction: jest.fn((callback) => callback(createMockPrismaClient())),

  // Connection management
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
});

/**
 * Mock Redis Client
 *
 * WHY: Prevents real Redis connections in unit tests.
 * Provides all commonly used Redis operations.
 */
export const createMockRedisClient = () => ({
  // String operations
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
  incrbyfloat: jest.fn().mockResolvedValue(1.0),
  decr: jest.fn().mockResolvedValue(0),

  // Hash operations
  hget: jest.fn().mockResolvedValue(null),
  hset: jest.fn().mockResolvedValue(1),
  hmset: jest.fn().mockResolvedValue('OK'),
  hgetall: jest.fn().mockResolvedValue({}),
  hdel: jest.fn().mockResolvedValue(1),

  // List operations
  lpush: jest.fn().mockResolvedValue(1),
  rpush: jest.fn().mockResolvedValue(1),
  lpop: jest.fn().mockResolvedValue(null),
  rpop: jest.fn().mockResolvedValue(null),
  lrange: jest.fn().mockResolvedValue([]),

  // Set operations
  sadd: jest.fn().mockResolvedValue(1),
  smembers: jest.fn().mockResolvedValue([]),
  sismember: jest.fn().mockResolvedValue(0),
  srem: jest.fn().mockResolvedValue(1),

  // Key operations
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
  keys: jest.fn().mockResolvedValue([]),

  // Connection management
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),

  // Status
  status: 'ready' as const,
  on: jest.fn(),
  once: jest.fn(),
  off: jest.fn(),
});

/**
 * Mock BullMQ Queue
 *
 * WHY: Prevents real Redis connections for job queues.
 */
export const createMockQueue = (name: string) => ({
  name,
  add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  getJob: jest.fn().mockResolvedValue(null),
  getJobs: jest.fn().mockResolvedValue([]),
  removeJobs: jest.fn().mockResolvedValue(undefined),
  clean: jest.fn().mockResolvedValue([]),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  obliterate: jest.fn().mockResolvedValue(undefined),
});

/**
 * Mock BullMQ Worker
 *
 * WHY: Prevents real job processing in tests.
 */
export const createMockWorker = (name: string) => ({
  name,
  run: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  once: jest.fn(),
  off: jest.fn(),
});

/**
 * Reset all mocks
 *
 * Call this in beforeEach() or afterEach() to ensure test isolation.
 */
export const resetAllMocks = () => {
  jest.clearAllMocks();
  jest.resetAllMocks();
};
