# API Documentation

## Base URL

- Local: `http://localhost:8000`

## Endpoint

### `POST /api/events`

Queues a new event for asynchronous notification processing.

#### Request Headers

- `Content-Type: application/json`

#### Request Body

```json
{
  "type": "user_signed_up",
  "payload": {
    "userId": "uuid-123",
    "email": "user@example.com",
    "username": "johndoe"
  }
}
```

#### Validation Rules

- `type` is required and must be a non-empty string.
- `type` max length is 100 characters.
- `payload` is required and must be a JSON object.

#### Success Response

- Status: `202 Accepted`

```json
{
  "status": "accepted",
  "eventId": "19f0f9a7-a9b2-4ec7-a4fc-83ef287f5f2b"
}
```

#### Error Responses

- Status: `400 Bad Request`

```json
{
  "error": "Validation failed",
  "details": ["\"type\" is required and must be a non-empty string."]
}
```

- Status: `429 Too Many Requests`

```json
{
  "error": "Too many requests, please try again later."
}
```

- Status: `500 Internal Server Error`

```json
{
  "error": "Failed to queue event"
}
```

## Health Check

### `GET /health`

Reports publisher health and RabbitMQ connectivity.

- `200 OK` when healthy.
- `503 Service Unavailable` when RabbitMQ is not connected.
