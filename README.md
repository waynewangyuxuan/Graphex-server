# Graphex Server

Backend API for Graphex - AI-powered knowledge graph learning platform.

## Quick Start

### Prerequisites

- Node.js 20+ LTS
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev
```

The server will start at `http://localhost:3000`.

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix linting issues
- `npm run format` - Format code with Prettier
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report

## API Endpoints

### Health Checks

- `GET /health` - Basic health check
- `GET /health/ready` - Readiness check (includes database/Redis status)

### Documents

- `POST /api/v1/documents` - Upload document file
- `POST /api/v1/documents/from-url` - Create document from URL
- `GET /api/v1/documents/:id` - Get document details
- `GET /api/v1/documents/:id/status` - Check processing status

### Graphs

- `POST /api/v1/graphs/generate` - Generate knowledge graph (async)
- `GET /api/v1/graphs/:id` - Get graph data
- `GET /api/v1/jobs/:id` - Check job status

### Connections

- `POST /api/v1/connections/explain` - Get AI explanation for edge

### Quizzes

- `POST /api/v1/quizzes/generate` - Generate quiz questions
- `POST /api/v1/quizzes/:id/submit` - Submit quiz answers

### Notes

- `POST /api/v1/notes` - Create note
- `GET /api/v1/notes?graphId=:id` - Get all notes for graph
- `PUT /api/v1/notes/:id` - Update note
- `DELETE /api/v1/notes/:id` - Delete note

## Project Structure

```
src/
├── config/           # Configuration and constants
├── routes/           # API route definitions
├── controllers/      # HTTP request handlers
├── services/         # Business logic (to be implemented)
├── middleware/       # Express middleware
├── utils/            # Helper functions
└── types/            # TypeScript type definitions
```

## Environment Variables

See `.env.example` for all available environment variables.

## Architecture

This API follows a layered architecture pattern:
- **Routes**: Define endpoints and apply middleware
- **Controllers**: Handle HTTP request/response
- **Services**: Encapsulate business logic
- **Utils**: Shared utility functions

All responses follow a standardized format:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2025-11-11T10:00:00Z",
    "requestId": "uuid"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  },
  "meta": {
    "timestamp": "2025-11-11T10:00:00Z",
    "requestId": "uuid"
  }
}
```

## Documentation

For detailed technical documentation, see:
- [Technical Design](META/Core/TECHNICAL.md)
- [Development Principles](META/Core/REGULATION.md)
- [MVP Features](META/Core/MVP.md)

## License

MIT
