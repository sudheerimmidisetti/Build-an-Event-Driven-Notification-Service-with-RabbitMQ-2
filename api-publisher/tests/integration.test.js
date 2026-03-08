const amqp = require("amqplib");

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === "true";
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

describeIntegration("Integration: API -> RabbitMQ -> Consumer", () => {
  const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:8000";
  const rabbitmqHost = process.env.RABBITMQ_HOST || "localhost";
  const rabbitmqPort = Number(process.env.RABBITMQ_PORT || 5672);
  const rabbitmqUser = process.env.RABBITMQ_USER || "guest";
  const rabbitmqPassword = process.env.RABBITMQ_PASSWORD || "guest";
  const queueName = process.env.NOTIFICATION_QUEUE_NAME || "notification_queue";

  let connection;
  let channel;

  beforeAll(async () => {
    const url = `amqp://${encodeURIComponent(rabbitmqUser)}:${encodeURIComponent(
      rabbitmqPassword,
    )}@${rabbitmqHost}:${rabbitmqPort}`;

    connection = await amqp.connect(url);
    channel = await connection.createChannel();
  });

  afterAll(async () => {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
  });

  test("accepts event and queue drains with active consumer", async () => {
    const payload = {
      type: "order_placed",
      payload: {
        orderId: `order-${Date.now()}`,
        email: "buyer@example.com",
      },
    };

    const apiResponse = await fetch(`${apiBaseUrl}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    expect(apiResponse.status).toBe(202);

    let queueState;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      queueState = await channel.checkQueue(queueName);
      if (queueState.messageCount === 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    expect(queueState.messageCount).toBe(0);
  }, 20_000);
});
