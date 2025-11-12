# Graphex Server - Quick Start Guide

Get the Graphex backend running in 60 seconds!

---

## Prerequisites

- **Node.js 20+** installed
- **Docker Desktop** running
- **Git** (for cloning)

---

## Setup (First Time Only)

### 1. Clone and Install
```bash
git clone https://github.com/your-org/Graphex-server.git
cd Graphex-server
npm install
```

### 2. Configure Environment
```bash
# Copy example env file
cp .env.example .env.development

# Edit .env.development and add your API keys:
# - ANTHROPIC_API_KEY (for Claude)
# - OPENAI_API_KEY (optional, for fallback)
```

### 3. Generate Prisma Client
```bash
npm run prisma:generate
```

---

## Starting the Server

### Simple Commands

```bash
# Start all services (Docker + Database + API)
npm run up

# Stop all services
npm run down

# Restart all services
npm run restart
```

### What `npm run up` Does

1. 🐳 Starts Docker containers (PostgreSQL + Redis)
2. 🗄️ Runs database migrations
3. 🚀 Starts API server on `http://localhost:3000`

You'll see a beautiful console output showing the startup progress!

---

## Checking Services

### Health Check
```bash
curl http://localhost:3000/health
```

### Check Running Containers
```bash
npm run ps
# or
docker-compose ps
```

### View Logs
```bash
npm run logs
```

---

## API Endpoints

Once running, your API is available at:

**Base URL**: `http://localhost:3000/api/v1`

### Key Endpoints

- `GET /health` - Health check
- `POST /api/v1/documents` - Upload document
- `POST /api/v1/graphs/generate` - Generate knowledge graph
- `GET /api/v1/graphs/:id` - Get graph data

**Full API documentation**: See [API_REFERENCE.md](API_REFERENCE.md)

---

## Development Workflow

### 1. Start Services
```bash
npm run up
```

### 2. Make Code Changes
The API server runs with hot-reload (`tsx watch`), so changes are reflected immediately.

### 3. View Logs
```bash
# API logs appear in the terminal where you ran `npm run up`

# View Docker container logs
npm run logs
```

### 4. Stop Services
```bash
npm run down
# or Ctrl+C in the terminal where the server is running
```

---

## Database Management

### View Database (Prisma Studio)
```bash
npm run prisma:studio
# Opens at http://localhost:5555
```

### Run Migrations
```bash
npm run prisma:migrate:dev init
# Creates a new migration named "init"
```

### Seed Sample Data
```bash
npm run prisma:seed
```

### Reset Database
```bash
npm run down  # Stop everything
docker volume rm graphex-server_postgres_data  # Delete data
npm run up    # Restart (fresh DB)
```

---

## Troubleshooting

### Port Already in Use
```bash
# Check what's using port 3000
lsof -ti:3000

# Kill the process
lsof -ti:3000 | xargs kill -9

# Or change the port in .env.development
PORT=3001
```

### Docker Issues
```bash
# Check Docker is running
docker ps

# Restart Docker Desktop if needed

# Clean up containers
docker-compose down --volumes
npm run up
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
docker-compose ps

# View postgres logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Redis Connection Issues
```bash
# Check Redis is running
docker-compose ps

# Test Redis connection
docker-compose exec redis redis-cli ping
# Should return: PONG

# Restart Redis
docker-compose restart redis
```

---

## Testing the API

### Using cURL
```bash
# Health check
curl http://localhost:3000/health

# Upload document (placeholder - returns mock data)
curl -X POST http://localhost:3000/api/v1/documents \
  -F "file=@sample.pdf" \
  -F "title=Sample Document"
```

### Using Postman/Insomnia
1. Import collection (TODO: create collection)
2. Set base URL: `http://localhost:3000`
3. Test endpoints

### Using Frontend
Your frontend can now connect to:
```javascript
const API_BASE_URL = 'http://localhost:3000/api/v1';

const response = await fetch(`${API_BASE_URL}/health`);
const data = await response.json();
console.log(data);  // { success: true, data: { status: 'ok' } }
```

---

## Project Structure

```
graphex-server/
├── src/
│   ├── app.ts           # Express app setup
│   ├── server.ts        # Server entry point
│   ├── config/          # Configuration
│   ├── controllers/     # HTTP handlers
│   ├── routes/          # API routes
│   ├── middleware/      # Express middleware
│   ├── services/        # Business logic (to be implemented)
│   └── types/           # TypeScript types
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # Database migrations
├── scripts/
│   ├── start.js         # Startup script
│   └── stop.js          # Shutdown script
├── .env.development     # Environment config
├── docker-compose.yml   # Docker services
└── API_REFERENCE.md     # Full API docs
```

---

## Common Commands

```bash
# Development
npm run dev              # Start dev server (no Docker)
npm run up               # Start all services
npm run down             # Stop all services
npm run restart          # Restart all services

# Database
npm run prisma:studio    # Open database GUI
npm run prisma:migrate:dev name  # Create migration
npm run prisma:seed      # Seed sample data

# Code Quality
npm run typecheck        # Check TypeScript
npm run lint             # Lint code
npm run lint:fix         # Fix lint issues
npm run format           # Format code

# Testing
npm run test             # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage

# Docker
npm run ps               # Show containers
npm run logs             # View logs
docker-compose down      # Stop containers
docker-compose down -v   # Stop + remove volumes
```

---

## Next Steps

1. **Add API Keys**: Edit `.env.development` with your Anthropic/OpenAI keys
2. **Implement Services**: Follow [META/TODO.md](META/TODO.md) roadmap
3. **Write Tests**: See [TESTING.md](TESTING.md) (coming soon)
4. **Deploy**: See [DEPLOYMENT.md](DEPLOYMENT.md) (coming soon)

---

## Getting Help

- **API Documentation**: [API_REFERENCE.md](API_REFERENCE.md)
- **Architecture**: [META/Core/TECHNICAL.md](META/Core/TECHNICAL.md)
- **Development Guide**: [META/Core/REGULATION.md](META/Core/REGULATION.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/Graphex-server/issues)

---

**Happy Coding!** 🚀
