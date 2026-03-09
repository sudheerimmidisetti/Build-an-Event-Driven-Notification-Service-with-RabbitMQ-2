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
