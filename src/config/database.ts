/**
 * Prisma Database Configuration
 *
 * Implements singleton pattern for Prisma Client to ensure
 * a single instance is used throughout the application.
 *
 * This prevents connection pool exhaustion and ensures
 * optimal performance in development and production.
 */

import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Global Prisma instance declaration for development hot-reloading
 * Prevents creating multiple instances during HMR
 */
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Configure Prisma Client options based on environment
 */
const prismaClientOptions: Prisma.PrismaClientOptions = {
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
};

/**
 * Singleton Prisma Client instance
 *
 * In development: Reuses global instance to prevent connection issues during HMR
 * In production: Creates a new instance
 */
export const prisma =
  global.prisma ||
  new PrismaClient(prismaClientOptions);

// In development, store instance globally for HMR
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

/**
 * Gracefully disconnect from database on process termination
 */
async function disconnectDatabase() {
  await prisma.$disconnect();
  console.log('Database connection closed');
}

process.on('SIGINT', disconnectDatabase);
process.on('SIGTERM', disconnectDatabase);

/**
 * Test database connection
 * Useful for health checks and startup verification
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

/**
 * Health check for database connection
 * Alias for testDatabaseConnection for consistency with other health checks
 */
export const checkDatabaseHealth = testDatabaseConnection;

/**
 * Get database connection statistics
 * Useful for monitoring and debugging
 * Note: Metrics API requires Prisma Client extension
 */
export async function getDatabaseStats() {
  try {
    // Metrics API is available in Prisma 5+ with extension
    // For basic stats, we can query connection info
    const result = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*) as count FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    return { activeConnections: result[0]?.count || 0 };
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return null;
  }
}
