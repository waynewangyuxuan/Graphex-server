/**
 * Jest Setup File
 * Global setup for all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/graphex_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';

// Increase test timeout for integration tests
jest.setTimeout(10000);

// Mock console methods to reduce noise in test output (optional)
// Comment out if you want to see console output during tests
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test setup
beforeAll(async () => {
  // Add any global setup here
  // Example: Initialize test database, clear Redis cache, etc.
});

// Global test teardown
afterAll(async () => {
  // Add any global teardown here
  // Example: Close database connections, clear Redis cache, etc.
});
