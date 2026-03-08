const http = require("http");
const amqp = require("amqplib");
const dotenv = require("dotenv");
const { EventProcessor, TransientProcessingError } = require("./processor");

dotenv.config();

const config = {
  rabbitmqHost: process.env.RABBITMQ_HOST || "rabbitmq",
  rabbitmqPort: Number(process.env.RABBITMQ_PORT || 5672),
  rabbitmqUser: process.env.RABBITMQ_USER || "guest",
  rabbitmqPassword: process.env.RABBITMQ_PASSWORD || "guest",
  exchangeName:
    process.env.NOTIFICATION_EXCHANGE_NAME || "notification_exchange",
  queueName: process.env.NOTIFICATION_QUEUE_NAME || "notification_queue",
  dlxExchangeName: process.env.DLX_EXCHANGE_NAME || "dlx_exchange",
  dlqQueueName: process.env.DLQ_QUEUE_NAME || "dlq_queue",
  routingKey: process.env.NOTIFICATION_ROUTING_KEY || "notification",
  maxRetries: Number(process.env.CONSUMER_MAX_RETRIES || 3),
  prefetch: Number(process.env.CONSUMER_PREFETCH || 10),
  healthPort: Number(process.env.WORKER_HEALTH_PORT || 8001),
};

function getConnectionUrl() {
  return `amqp://${encodeURIComponent(config.rabbitmqUser)}:${encodeURIComponent(
    config.rabbitmqPassword,
  )}@${config.rabbitmqHost}:${config.rabbitmqPort}`;
}

async function connectWithRetry(attempts = 20, delayMs = 3_000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const connection = await amqp.connect(getConnectionUrl());
      console.log("[consumer] Connected to RabbitMQ.");
      return connection;
    } catch (error) {
      console.error(
        `[consumer] RabbitMQ connection attempt ${attempt}/${attempts} failed:`,
        error.message,
      );

      if (attempt === attempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Unable to connect to RabbitMQ.");
}

function startHealthServer(state) {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      if (state.isReady) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "degraded" }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(config.healthPort, () => {
    console.log(
      `[consumer] Health endpoint listening on port ${config.healthPort}`,
    );
  });

  return server;
}

async function startWorker() {
  const state = { isReady: false };
  const processor = new EventProcessor();

  let connection;
  let channel;

  const healthServer = startHealthServer(state);

  try {
    connection = await connectWithRetry();
    channel = await connection.createChannel();

    connection.on("error", (error) => {
      console.error("[consumer] RabbitMQ connection error:", error.message);
      state.isReady = false;
    });

    connection.on("close", () => {
      console.error("[consumer] RabbitMQ connection closed.");
      state.isReady = false;
    });

    await channel.assertExchange(config.exchangeName, "direct", {
      durable: true,
    });
    await channel.assertExchange(config.dlxExchangeName, "direct", {
      durable: true,
    });

    await channel.assertQueue(config.dlqQueueName, { durable: true });
    await channel.bindQueue(
      config.dlqQueueName,
      config.dlxExchangeName,
      config.dlqQueueName,
    );

    await channel.assertQueue(config.queueName, {
      durable: true,
      deadLetterExchange: config.dlxExchangeName,
      deadLetterRoutingKey: config.dlqQueueName,
    });
    await channel.bindQueue(
      config.queueName,
      config.exchangeName,
      config.routingKey,
    );

    await channel.prefetch(config.prefetch);

    state.isReady = true;

    console.log(
      `[consumer] Waiting for messages on queue: ${config.queueName}`,
    );

    await channel.consume(config.queueName, async (message) => {
      if (!message) {
        return;
      }

      const headers = message.properties.headers || {};
      const retryCount = Number(headers["x-retry-count"] || 0);

      try {
        const body = JSON.parse(message.content.toString("utf-8"));
        const result = await processor.processNotificationEvent(body);

        channel.ack(message);
        console.log(`[consumer] ACK sent for ${result.eventId}`);
      } catch (error) {
        const shouldRetry =
          error instanceof TransientProcessingError &&
          retryCount < config.maxRetries;

        if (shouldRetry) {
          const nextRetryCount = retryCount + 1;
          const existingBody = message.content.toString("utf-8");

          channel.publish(
            config.exchangeName,
            config.routingKey,
            Buffer.from(existingBody),
            {
              persistent: true,
              contentType: message.properties.contentType || "application/json",
              messageId: message.properties.messageId,
              timestamp: Date.now(),
              headers: {
                ...headers,
                "x-retry-count": nextRetryCount,
              },
            },
          );

          channel.ack(message);
          console.error(
            `[consumer] Transient error. Requeued message ${message.properties.messageId} (retry ${nextRetryCount}/${config.maxRetries})`,
          );
          return;
        }

        channel.nack(message, false, false);
        console.error(
          `[consumer] NACK sent for ${message.properties.messageId || "unknown-message"}; routed to DLQ. Error: ${error.message}`,
        );
      }
    });

    let shuttingDown = false;

    const shutdown = async (signal) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      console.log(
        `[consumer] Received ${signal}. Starting graceful shutdown...`,
      );
      state.isReady = false;

      try {
        await channel.close();
      } catch (error) {
        console.error("[consumer] Error closing channel:", error.message);
      }

      try {
        await connection.close();
      } catch (error) {
        console.error("[consumer] Error closing connection:", error.message);
      }

      healthServer.close(() => {
        process.exit(0);
      });

      setTimeout(() => {
        console.error("[consumer] Forced shutdown due to timeout.");
        process.exit(1);
      }, 10_000).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    return { connection, channel, processor, state, healthServer };
  } catch (error) {
    state.isReady = false;

    if (channel) {
      await channel.close().catch(() => {});
    }

    if (connection) {
      await connection.close().catch(() => {});
    }

    healthServer.close();

    console.error("[consumer] Worker startup failed:", error);
    throw error;
  }
}

if (require.main === module) {
  startWorker().catch(() => {
    process.exit(1);
  });
}

module.exports = {
  startWorker,
  connectWithRetry,
};
