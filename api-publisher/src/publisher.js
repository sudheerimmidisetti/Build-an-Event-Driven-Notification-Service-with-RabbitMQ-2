const amqp = require("amqplib");
const { once } = require("events");
const { v4: uuidv4 } = require("uuid");

class EventPublisher {
  constructor(config = {}) {
    this.rabbitmqHost =
      config.rabbitmqHost || process.env.RABBITMQ_HOST || "rabbitmq";
    this.rabbitmqPort = Number(
      config.rabbitmqPort || process.env.RABBITMQ_PORT || 5672,
    );
    this.rabbitmqUser =
      config.rabbitmqUser || process.env.RABBITMQ_USER || "guest";
    this.rabbitmqPassword =
      config.rabbitmqPassword || process.env.RABBITMQ_PASSWORD || "guest";

    this.exchangeName =
      config.exchangeName ||
      process.env.NOTIFICATION_EXCHANGE_NAME ||
      "notification_exchange";
    this.queueName =
      config.queueName ||
      process.env.NOTIFICATION_QUEUE_NAME ||
      "notification_queue";
    this.dlxExchangeName =
      config.dlxExchangeName || process.env.DLX_EXCHANGE_NAME || "dlx_exchange";
    this.dlqQueueName =
      config.dlqQueueName || process.env.DLQ_QUEUE_NAME || "dlq_queue";
    this.routingKey =
      config.routingKey ||
      process.env.NOTIFICATION_ROUTING_KEY ||
      "notification";

    this.connection = null;
    this.channel = null;
    this.closing = false;
  }

  getConnectionUrl() {
    return `amqp://${encodeURIComponent(this.rabbitmqUser)}:${encodeURIComponent(
      this.rabbitmqPassword,
    )}@${this.rabbitmqHost}:${this.rabbitmqPort}`;
  }

  isReady() {
    return Boolean(this.connection && this.channel && !this.closing);
  }

  async connect() {
    if (this.isReady()) {
      return;
    }

    const url = this.getConnectionUrl();
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createConfirmChannel();

    this.connection.on("error", (error) => {
      console.error("[publisher] RabbitMQ connection error:", error.message);
    });

    this.connection.on("close", () => {
      if (!this.closing) {
        console.error("[publisher] RabbitMQ connection closed unexpectedly.");
      }
      this.connection = null;
      this.channel = null;
    });

    await this.channel.assertExchange(this.exchangeName, "direct", {
      durable: true,
    });
    await this.channel.assertExchange(this.dlxExchangeName, "direct", {
      durable: true,
    });

    await this.channel.assertQueue(this.dlqQueueName, {
      durable: true,
    });
    await this.channel.bindQueue(
      this.dlqQueueName,
      this.dlxExchangeName,
      this.dlqQueueName,
    );

    await this.channel.assertQueue(this.queueName, {
      durable: true,
      deadLetterExchange: this.dlxExchangeName,
      deadLetterRoutingKey: this.dlqQueueName,
    });
    await this.channel.bindQueue(
      this.queueName,
      this.exchangeName,
      this.routingKey,
    );

    console.log("[publisher] Connected to RabbitMQ and topology declared.");
  }

  async publishEvent(eventType, payload) {
    if (!this.isReady()) {
      throw new Error("Publisher is not connected to RabbitMQ.");
    }

    const event = {
      event_id: uuidv4(),
      type: eventType,
      payload,
      created_at: new Date().toISOString(),
    };

    const buffer = Buffer.from(JSON.stringify(event));

    const wasBuffered = this.channel.publish(
      this.exchangeName,
      this.routingKey,
      buffer,
      {
        persistent: true,
        contentType: "application/json",
        timestamp: Date.now(),
        messageId: event.event_id,
        headers: {
          "x-retry-count": 0,
        },
      },
    );

    if (!wasBuffered) {
      await once(this.channel, "drain");
    }

    await this.channel.waitForConfirms();

    console.log(`[publisher] Event queued: ${event.event_id} (${event.type})`);
    return event.event_id;
  }

  async close() {
    this.closing = true;

    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    console.log("[publisher] RabbitMQ connection closed.");
  }
}

module.exports = EventPublisher;
