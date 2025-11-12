/**
 * Mock Implementations for External Dependencies
 *
 * WHY: Prevents real API calls and external service dependencies during testing,
 * ensuring fast, isolated, and deterministic tests
 */

/**
 * Mock Anthropic Claude API responses
 * WHY: Prevents real API calls to Claude and simulates various response scenarios
 */
export const mockClaudeResponse = {
  // Successful graph generation response
  graphGeneration: {
    id: 'msg_test123',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'graph TD\n  A[Concept A] --> B[Concept B]\n  B --> C[Concept C]\n  A --> C',
      },
    ],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 1000,
      output_tokens: 150,
    },
  },

  // Connection explanation response
  connectionExplanation: {
    id: 'msg_test456',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'Concept A supports Concept B because they share a fundamental relationship...',
      },
    ],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 500,
      output_tokens: 75,
    },
  },

  // Quiz generation response
  quizGeneration: {
    id: 'msg_test789',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: JSON.stringify([
          {
            questionText: 'What is Concept A?',
            options: [
              { id: 0, text: 'Option 1' },
              { id: 1, text: 'Option 2' },
              { id: 2, text: 'Option 3' },
              { id: 3, text: 'Option 4' },
            ],
            correctAnswer: 0,
            explanation: 'Concept A is defined as...',
            difficulty: 'medium',
          },
        ]),
      },
    ],
    model: 'claude-haiku-20250311',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 800,
      output_tokens: 200,
    },
  },

  // Error response (rate limit)
  rateLimitError: {
    error: {
      type: 'rate_limit_error',
      message: 'Rate limit exceeded',
    },
  },

  // Error response (API error)
  apiError: {
    error: {
      type: 'api_error',
      message: 'Internal server error',
    },
  },
};

/**
 * Mock OpenAI API responses (fallback)
 * WHY: Simulates OpenAI API for fallback scenarios
 */
export const mockOpenAIResponse = {
  // Successful completion
  completion: {
    id: 'chatcmpl-test123',
    object: 'chat.completion',
    created: 1699999999,
    model: 'gpt-4-turbo',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'graph TD\n  A[Node A] --> B[Node B]',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1000,
      completion_tokens: 150,
      total_tokens: 1150,
    },
  },

  // Error response
  error: {
    error: {
      message: 'Rate limit exceeded',
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
    },
  },
};

/**
 * Mock Multer file object
 * WHY: Simulates uploaded file for testing file upload endpoints
 */
export const createMockFile = (overrides?: Partial<Express.Multer.File>): Express.Multer.File => {
  return {
    fieldname: 'file',
    originalname: 'test-document.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024000,
    destination: '/tmp',
    filename: 'test-document-123.pdf',
    path: '/tmp/test-document-123.pdf',
    buffer: Buffer.from('mock file content'),
    stream: null as any,
    ...overrides,
  };
};

/**
 * Mock Redis client methods
 * WHY: Simulates caching behavior without real Redis connection
 */
export const createMockRedisClient = () => {
  const cache = new Map<string, string>();

  return {
    get: jest.fn(async (key: string) => {
      return cache.get(key) || null;
    }),
    set: jest.fn(async (key: string, value: string, ...args: any[]) => {
      cache.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      keys.forEach(k => cache.delete(k));
      return keys.length;
    }),
    exists: jest.fn(async (key: string) => {
      return cache.has(key) ? 1 : 0;
    }),
    expire: jest.fn(async (key: string, seconds: number) => {
      return 1;
    }),
    flushall: jest.fn(async () => {
      cache.clear();
      return 'OK';
    }),
    quit: jest.fn(async () => 'OK'),
    connect: jest.fn(async () => {}),
    disconnect: jest.fn(async () => {}),
    on: jest.fn(),
  };
};

/**
 * Mock Prisma client methods
 * WHY: Simulates database operations without real database
 */
export const createMockPrismaClient = () => {
  return {
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
    $transaction: jest.fn((callback: any) => callback(mockPrismaClient)),
  };
};

// Export singleton instance for convenience
export const mockPrismaClient = createMockPrismaClient();
export const mockRedisClient = createMockRedisClient();

/**
 * Mock BullMQ Queue
 * WHY: Simulates job queue without real Redis connection
 */
export const createMockQueue = (name: string) => {
  return {
    add: jest.fn(async (jobName: string, data: any, options?: any) => {
      return {
        id: `job-test-${Date.now()}`,
        name: jobName,
        data,
        opts: options,
      };
    }),
    getJob: jest.fn(async (jobId: string) => {
      return {
        id: jobId,
        data: {},
        progress: 100,
        returnvalue: { status: 'completed' },
      };
    }),
    close: jest.fn(async () => {}),
    obliterate: jest.fn(async () => {}),
  };
};

/**
 * Mock Winston Logger
 * WHY: Prevents actual logging during tests, can verify logging calls
 */
export const createMockLogger = () => {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };
};

/**
 * Mock Puppeteer for web scraping tests
 * WHY: Prevents real browser automation during tests
 */
export const createMockPuppeteer = () => {
  const mockPage = {
    goto: jest.fn(async () => {}),
    content: jest.fn(async () => '<html><body><h1>Test Article</h1><p>Content</p></body></html>'),
    close: jest.fn(async () => {}),
  };

  const mockBrowser = {
    newPage: jest.fn(async () => mockPage),
    close: jest.fn(async () => {}),
  };

  return {
    launch: jest.fn(async () => mockBrowser),
    mockBrowser,
    mockPage,
  };
};

/**
 * Mock Cheerio for static web scraping tests
 * WHY: Simulates HTML parsing for testing
 */
export const mockCheerioHtml = {
  simple: '<html><body><h1>Test</h1><p>Content</p></body></html>',
  complex: `
    <html>
      <body>
        <article>
          <h1>Test Article Title</h1>
          <div class="content">
            <p>Paragraph 1 with <strong>important</strong> information.</p>
            <p>Paragraph 2 with additional details.</p>
          </div>
        </article>
      </body>
    </html>
  `,
};
