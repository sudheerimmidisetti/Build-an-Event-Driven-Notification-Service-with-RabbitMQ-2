const {
  EventProcessor,
  TransientProcessingError,
} = require("../src/processor");

describe("EventProcessor", () => {
  let processor;

  beforeEach(() => {
    processor = new EventProcessor();
  });

  test("processes a valid event", async () => {
    const result = await processor.processNotificationEvent({
      event_id: "evt-1",
      type: "user_signed_up",
      payload: { email: "user@example.com" },
    });

    expect(result).toEqual({ status: "processed", eventId: "evt-1" });
    expect(processor.hasProcessed("evt-1")).toBe(true);
  });

  test("returns duplicate when same event is processed twice", async () => {
    await processor.processNotificationEvent({
      event_id: "evt-2",
      type: "order_placed",
      payload: { orderId: "o-2" },
    });

    const second = await processor.processNotificationEvent({
      event_id: "evt-2",
      type: "order_placed",
      payload: { orderId: "o-2" },
    });

    expect(second).toEqual({ status: "duplicate", eventId: "evt-2" });
  });

  test("throws transient error for retriable failures", async () => {
    await expect(
      processor.processNotificationEvent({
        event_id: "evt-3",
        type: "user_signed_up",
        payload: { simulateTransientFailure: true },
      }),
    ).rejects.toBeInstanceOf(TransientProcessingError);
  });

  test("throws permanent error for non-retriable failures", async () => {
    await expect(
      processor.processNotificationEvent({
        event_id: "evt-4",
        type: "user_signed_up",
        payload: { simulatePermanentFailure: true },
      }),
    ).rejects.toThrow("Simulated permanent failure.");
  });

  test("throws on missing event_id", async () => {
    await expect(
      processor.processNotificationEvent({
        type: "user_signed_up",
        payload: { email: "user@example.com" },
      }),
    ).rejects.toThrow("Message is missing a valid event_id.");
  });
});
