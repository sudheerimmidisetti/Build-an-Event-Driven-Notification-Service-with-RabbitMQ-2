# Build an Event-Driven Notification Service with RabbitMQ

Production-ready event-driven notification system built with Node.js, Express, RabbitMQ, and Docker Compose.

## Services

- `api-publisher`: Accepts events via HTTP and publishes to RabbitMQ.
- `event-consumer`: Consumes events, processes notifications asynchronously, and handles retries.
- `rabbitmq`: Message broker with management UI.

## Project Structure

```text
project-root/
├── api-publisher/
│   ├── src/
│   │   ├── app.js
│   │   ├── routes.js
│   │   ├── publisher.js
│   │   └── validation.js
│   ├── tests/
│   │   ├── publisher.test.js
│   │   └── integration.test.js
│   ├── package.json
│   └── Dockerfile
├── event-consumer/
│   ├── src/
│   │   ├── worker.js
│   │   └── processor.js
│   ├── tests/
│   │   └── processor.test.js
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── README.md
├── API_DOCS.md
└── ARCHITECTURE.md
```

## Features

- REST API endpoint: `POST /api/events`
- Input validation for event contracts
- RabbitMQ direct exchange + durable queue
- Dead-letter exchange/queue for failed messages
- Consumer retry flow for transient failures
- ACK on success, NACK to DLQ on final failure
- Basic API rate limiting
- Idempotent consumer processing logic
- Graceful shutdown for API and worker
- Dockerized services with health checks and persistent broker volume

## Quick Start

1. Copy environment file:

```bash
cp .env.example .env
```

2. Start all services:

```bash
docker compose up --build
```

3. Open RabbitMQ Management UI:

- URL: `http://localhost:15672`
- Username: value from `RABBITMQ_USER`
- Password: value from `RABBITMQ_PASSWORD`

## API Usage

Publish an event:

```bash
curl -X POST http://localhost:8000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "user_signed_up",
    "payload": {
      "userId": "uuid-123",
      "email": "user@example.com",
      "username": "johndoe"
    }
  }'
```

Expected response: `202 Accepted`

See full API details in `API_DOCS.md`.

## Running Tests

Run publisher unit tests:

```bash
cd api-publisher
npm install
npm test
```

Run consumer unit tests:

```bash
cd event-consumer
npm install
npm test
```

Run integration test example (requires running stack):

```bash
cd api-publisher
RUN_INTEGRATION_TESTS=true npm run test:integration
```

## Design Notes

- Publisher confirms message persistence with RabbitMQ confirm channels.
- Consumer retries transient errors by republishing with incremented retry headers.
- After max retries, consumer sends NACK (`requeue=false`) so message is dead-lettered.
- Idempotency is enforced by tracking processed `event_id` values in memory.
- RabbitMQ queue and messages are durable; broker data is persisted via Docker volume.

## Health Endpoints

- Publisher: `GET http://localhost:8000/health`
- Consumer: `GET http://localhost:8001/health`

## Shutdown Behavior

Both services handle `SIGINT` and `SIGTERM` for graceful shutdown by closing HTTP and RabbitMQ resources cleanly.
