const request = require("supertest");

jest.mock("amqplib", () => ({
  connect: jest.fn(),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(() => "event-123"),
}));

const amqp = require("amqplib");
const { validateEventPayload } = require("../src/validation");
const EventPublisher = require("../src/publisher");
const { buildApp } = require("../src/app");

describe("validateEventPayload", () => {
  test("returns errors for invalid body", () => {
    const result = validateEventPayload({ type: "", payload: null });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("returns valid for well-formed body", () => {
    const result = validateEventPayload({
      type: "user_signed_up",
      payload: { userId: "u-1" },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("EventPublisher", () => {
  let mockChannel;
  let mockConnection;

  beforeEach(() => {
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockReturnValue(true),
      waitForConfirms: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createConfirmChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    amqp.connect.mockResolvedValue(mockConnection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("connects and declares topology", async () => {
    const publisher = new EventPublisher();

    await publisher.connect();

    expect(amqp.connect).toHaveBeenCalledTimes(1);
    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      "notification_exchange",
      "direct",
      { durable: true }
    );

    expect(mockChannel.assertQueue).toHaveBeenCalledWith(
      "notification_queue",
      expect.any(Object)
    );

    expect(publisher.isReady()).toBe(true);
  });

  test("publishes event to exchange", async () => {
    const publisher = new EventPublisher();
    await publisher.connect();

    const eventId = await publisher.publishEvent("order_placed", {
      orderId: "o-1",
    });

    expect(eventId).toBe("event-123");

    expect(mockChannel.publish).toHaveBeenCalledWith(
      "notification_exchange",
      "notification",
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        messageId: "event-123",
      })
    );

    expect(mockChannel.waitForConfirms).toHaveBeenCalledTimes(1);
  });

  test("throws when publisher is not connected", async () => {
    const publisher = new EventPublisher();

    await expect(
      publisher.publishEvent("user_signed_up", { userId: "u-1" })
    ).rejects.toThrow("Publisher is not connected to RabbitMQ.");
  });
});

describe("POST /api/events", () => {
  test("returns 202 when event is accepted", async () => {
    const publisher = {
      publishEvent: jest.fn().mockResolvedValue("event-accepted"),
      isReady: jest.fn().mockReturnValue(true),
    };

    const app = buildApp({ publisher });

    const response = await request(app)
      .post("/api/events")
      .send({
        type: "user_signed_up",
        payload: { userId: "u-1", email: "user@example.com" },
      });

    expect(response.status).toBe(202);
    expect(response.body.eventId).toBe("event-accepted");
  });

  test("returns 400 when payload is invalid", async () => {
    const publisher = {
      publishEvent: jest.fn(),
      isReady: jest.fn().mockReturnValue(true),
    };

    const app = buildApp({ publisher });

    const response = await request(app)
      .post("/api/events")
      .send({
        type: "",
        payload: null,
      });

    expect(response.status).toBe(400);
    expect(publisher.publishEvent).not.toHaveBeenCalled();
  });
});