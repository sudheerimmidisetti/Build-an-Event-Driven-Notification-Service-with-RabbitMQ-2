# Architecture Overview

## High-Level Components

1. API Publisher (`api-publisher`)
2. RabbitMQ Broker (`rabbitmq`)
3. Event Consumer Worker (`event-consumer`)

## Messaging Topology

- Exchange: `notification_exchange` (type: `direct`, durable)
- Queue: `notification_queue` (durable)
- Dead-letter exchange: `dlx_exchange` (type: `direct`, durable)
- Dead-letter queue: `dlq_queue` (durable)
- Binding:
  - `notification_queue` <- `notification_exchange` with routing key `notification`
  - `dlq_queue` <- `dlx_exchange` with routing key `dlq_queue`

## Event Flow

1. Client sends `POST /api/events` with `type` and `payload`.
2. API validates input and publishes message to `notification_exchange`.
3. RabbitMQ routes the message to `notification_queue`.
4. Worker consumes message and runs processing logic.
5. On success, worker sends ACK.
6. On transient failure, worker republishes with incremented retry header and ACKs current message.
7. On final/permanent failure, worker sends NACK with `requeue=false`, and RabbitMQ routes message to `dlq_queue`.

## Resilience and Reliability

- Durable exchanges and queues to survive broker restarts.
- Persistent messages to reduce message loss risk.
- Confirm channel in publisher to ensure broker-level publish confirmation.
- Retry mechanism in worker via `x-retry-count` header.
- Dead-letter queue captures poison messages for manual inspection.
- Graceful shutdown in both services to avoid in-flight message loss.

## Concurrency and Idempotency

- RabbitMQ supports horizontal scaling of worker instances.
- Worker prefetch controls concurrent unacked messages per consumer.
- Processing is idempotent using `event_id` dedup tracking so repeated deliveries do not duplicate side effects.

## Operational Notes

- RabbitMQ management UI is available at `http://localhost:15672`.
- Service health checks are exposed and wired in Docker Compose.
- Credentials and queue settings are externalized with environment variables.
