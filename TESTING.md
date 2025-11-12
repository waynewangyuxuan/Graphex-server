# Graphex API Testing Infrastructure

Comprehensive testing setup for the Graphex Knowledge Graph Learning Platform backend.

## Overview

This testing infrastructure provides:
- **Jest** as the test framework with TypeScript support
- **Supertest** for HTTP endpoint testing
- **Unit tests** for middleware and utilities
- **Integration tests** for all API endpoints
- **Mock implementations** for external dependencies
- **Test data factories** for consistent test data generation
- **Coverage reporting** with 70% target threshold

## Test Structure

```
src/
├── __tests__/
│   ├── integration/           # API endpoint integration tests
│   │   ├── documents.test.ts
│   │   ├── graphs.test.ts
│   │   ├── connections.test.ts
│   │   ├── quizzes.test.ts
│   │   ├── notes.test.ts
│   │   └── health.test.ts
│   ├── unit/                  # Unit tests for individual modules
│   │   └── middleware/
│   │       ├── error-handler.test.ts
│   │       ├── validation.test.ts
│   │       └── request-logger.test.ts
│   ├── helpers/               # Test utilities
│   │   ├── setup.ts           # Setup/teardown functions
│   │   ├── factories.ts       # Test data factories
│   │   └── mocks.ts          # Mock implementations
│   └── fixtures/              # Static test data
│       └── sample-data.ts
├── jest.config.js             # Jest configuration
└── jest.setup.ts              # Global test setup
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (Development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Unit Tests Only
```bash
npm test -- --testPathPattern="unit"
```

### Integration Tests Only
```bash
npm test -- --testPathPattern="integration"
```

### Specific Test File
```bash
npm test -- documents.test
```

## Test Coverage

### Current Coverage Target: 70%

Coverage is measured across:
- **Statements**: 70%
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%

### Viewing Coverage Reports

After running `npm run test:coverage`:
- **Terminal**: Summary displayed in console
- **HTML Report**: Open `coverage/index.html` in browser
- **LCOV**: `coverage/lcov.info` for CI/CD integration

## Test Types

### 1. Integration Tests

Test complete API endpoints with HTTP requests:

```typescript
describe('POST /api/v1/documents', () => {
  it('should upload document successfully', async () => {
    const response = await request(app)
      .post('/api/v1/documents')
      .field('title', 'Test Document')
      .attach('file', Buffer.from('content'), 'test.pdf')
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
  });
});
```

**Endpoints Tested:**
- `POST /api/v1/documents` - File upload
- `POST /api/v1/documents/url` - URL extraction
- `GET /api/v1/documents/:id` - Document retrieval
- `GET /api/v1/documents/:id/status` - Processing status
- `POST /api/v1/graphs/generate` - Graph generation
- `GET /api/v1/graphs/:id` - Graph retrieval
- `GET /api/v1/jobs/:id` - Job status
- `POST /api/v1/connections/explain` - Connection explanation
- `POST /api/v1/quizzes/generate` - Quiz generation
- `POST /api/v1/quizzes/:id/submit` - Quiz submission
- `POST /api/v1/notes` - Note creation
- `GET /api/v1/notes/:id` - Note retrieval
- `PUT /api/v1/notes/:id` - Note update
- `DELETE /api/v1/notes/:id` - Note deletion
- `GET /health` - Basic health check
- `GET /health/ready` - Readiness check
- `GET /health/deep` - Deep health check

### 2. Unit Tests

Test individual functions and middleware in isolation:

```typescript
describe('errorHandler middleware', () => {
  it('should handle Zod validation errors', () => {
    const zodError = new ZodError([...]);
    errorHandler(zodError, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'INVALID_REQUEST',
        }),
      })
    );
  });
});
```

**Modules Tested:**
- Error handler middleware
- Validation middleware (Zod)
- Request logger middleware
- Request ID middleware

### 3. Mock Implementations

All external dependencies are mocked to ensure isolated, fast tests:

**Mocked Services:**
- Anthropic Claude API
- OpenAI API
- Prisma Database Client
- Redis Cache
- BullMQ Job Queue
- File uploads (Multer)
- Web scraping (Puppeteer)

## Test Data Factories

Use factories to generate consistent test data:

```typescript
import {
  createMockDocument,
  createMockGraph,
  createMockQuizQuestions,
} from '../helpers/factories';

const document = createMockDocument({
  title: 'Custom Title',
  status: DocumentStatus.READY,
});

const graph = createMockGraph({
  documentId: document.id,
});
```

**Available Factories:**
- `createMockDocument()` - Document objects
- `createProcessingDocument()` - Documents in processing state
- `createFailedDocument()` - Failed documents
- `createUrlDocument()` - URL-based documents
- `createMockGraph()` - Graph objects
- `createGeneratingGraph()` - Graphs being generated
- `createMockNodes()` - Graph nodes
- `createMockEdges()` - Graph edges
- `createMockQuizQuestions()` - Quiz questions
- `createMockNote()` - User notes
- `createCompleteGraphData()` - Full graph with nodes and edges

## Testing Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach`/`afterEach` for setup/teardown
- Clear mocks between tests

### 2. Descriptive Test Names
```typescript
// Good
it('should return 400 when required fields are missing', ...)

// Bad
it('test validation', ...)
```

### 3. AAA Pattern (Arrange, Act, Assert)
```typescript
it('should create document successfully', async () => {
  // Arrange
  const testData = { title: 'Test' };

  // Act
  const response = await request(app)
    .post('/api/v1/documents')
    .send(testData);

  // Assert
  expect(response.status).toBe(201);
});
```

### 4. Test Both Success and Failure Cases
```typescript
describe('POST /api/v1/documents', () => {
  it('should succeed with valid data', ...);
  it('should return 400 with missing fields', ...);
  it('should return 400 with invalid file type', ...);
  it('should return 400 when file too large', ...);
});
```

### 5. Why Comments
Each test includes a "WHY" comment explaining its purpose:

```typescript
it('should return 404 for non-existent document', async () => {
  // WHY: Tests error handling for missing resources
  ...
});
```

## Environment Variables

Tests use separate environment variables:

```env
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/graphex_test
REDIS_URL=redis://localhost:6379/1
```

Set these in `jest.setup.ts` to ensure test isolation.

## Continuous Integration

### GitHub Actions Example
```yaml
- name: Run Tests
  run: npm test

- name: Generate Coverage
  run: npm run test:coverage

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Troubleshooting

### Tests Timing Out
- Increase timeout in `jest.config.js`: `testTimeout: 10000`
- Or per-test: `it('test name', async () => { ... }, 15000);`

### Database Connection Errors
- Ensure `DATABASE_URL` points to test database
- Mock database calls in unit tests

### Redis Connection Errors
- Ensure `REDIS_URL` points to test Redis instance
- Mock Redis calls in unit tests

### Coverage Not Meeting Threshold
```bash
# Run coverage with details
npm run test:coverage -- --verbose

# View HTML report
open coverage/index.html
```

## Integration with Development Workflow

### Pre-commit Hook (Recommended)
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test"
    }
  }
}
```

### Pre-push Hook
```json
{
  "husky": {
    "hooks": {
      "pre-push": "npm run test:coverage"
    }
  }
}
```

## Writing New Tests

### 1. Integration Test Template
```typescript
import request from 'supertest';
import { createApp } from '../../app';
import { setupTest, teardownTest } from '../helpers/setup';

describe('New API Endpoint', () => {
  let app: Application;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await teardownTest();
  });

  it('should handle valid request', async () => {
    const response = await request(app)
      .post('/api/v1/endpoint')
      .send({ data: 'test' })
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

### 2. Unit Test Template
```typescript
import { myFunction } from '../../../path/to/module';

describe('myFunction', () => {
  let mockDependency: jest.Mock;

  beforeEach(() => {
    mockDependency = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should perform expected behavior', () => {
    // WHY: Tests specific functionality
    const result = myFunction(mockDependency);
    expect(result).toBe(expectedValue);
  });
});
```

## Known Limitations

1. **Database Integration**: Integration tests currently use mocks. To test against real database:
   - Set up test database
   - Update `jest.setup.ts` with real connection
   - Clean database between tests

2. **AI API Mocking**: AI responses are mocked. To test real AI integration:
   - Use separate test API keys
   - Implement rate limiting in tests
   - Cache responses to avoid costs

3. **File Upload Testing**: File uploads use buffers. For real file testing:
   - Use temporary directories
   - Clean up files in teardown

## Future Improvements

- [ ] Add E2E tests with real database
- [ ] Add performance/load testing
- [ ] Add contract testing for API
- [ ] Implement snapshot testing for responses
- [ ] Add mutation testing for test quality
- [ ] Set up visual regression testing (if UI added)

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## Support

For testing questions or issues:
- Check this documentation
- Review existing test files for patterns
- Consult REGULATION.md for coding principles
- Ask in team chat/discussions

---

**Last Updated**: 2025-11-11
**Testing Framework Version**: Jest 29.7.0
**Coverage Target**: 70%
