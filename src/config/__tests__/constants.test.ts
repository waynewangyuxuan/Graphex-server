import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const loadCorsConfig = async () => {
  jest.resetModules();
  const { CORS_CONFIG } = await import('../constants');
  return CORS_CONFIG;
};

const originalEnv = { ...process.env };

describe('CORS_CONFIG', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.CORS_ORIGINS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses ALLOWED_ORIGINS when provided', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    const config = await loadCorsConfig();

    expect(config.ALLOWED_ORIGINS).toEqual(['https://app.example.com']);
  });

  it('falls back to CORS_ORIGINS when ALLOWED_ORIGINS is missing', async () => {
    process.env.CORS_ORIGINS = 'https://legacy.example.com';
    const config = await loadCorsConfig();

    expect(config.ALLOWED_ORIGINS).toEqual(['https://legacy.example.com']);
  });

  it('defaults to localhost when no env vars are set', async () => {
    const config = await loadCorsConfig();

    expect(config.ALLOWED_ORIGINS).toEqual(['http://localhost:3001']);
  });

  it('trims whitespace and ignores empty values', async () => {
    process.env.ALLOWED_ORIGINS = ' https://one.example.com , ,https://two.example.com ';
    const config = await loadCorsConfig();

    expect(config.ALLOWED_ORIGINS).toEqual([
      'https://one.example.com',
      'https://two.example.com',
    ]);
  });
});
