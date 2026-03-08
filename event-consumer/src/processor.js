class TransientProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransientProcessingError";
  }
}

class EventProcessor {
  constructor() {
    this.processedEventIds = new Set();
  }

  hasProcessed(eventId) {
    return this.processedEventIds.has(eventId);
  }

  markProcessed(eventId) {
    this.processedEventIds.add(eventId);

    // Keep memory bounded for long-running workers.
    if (this.processedEventIds.size > 10_000) {
      const firstItem = this.processedEventIds.values().next().value;
      this.processedEventIds.delete(firstItem);
    }
  }

  async processNotificationEvent(messageData) {
    const eventId = messageData?.event_id;

    if (!eventId || typeof eventId !== "string") {
      throw new Error("Message is missing a valid event_id.");
    }

    if (this.hasProcessed(eventId)) {
      console.log(`[consumer] Skipping duplicate event: ${eventId}`);
      return { status: "duplicate", eventId };
    }

    const eventType = messageData.type;
    const payload = messageData.payload || {};

    if (payload.simulateTransientFailure) {
      throw new TransientProcessingError("Simulated transient failure.");
    }

    if (payload.simulatePermanentFailure) {
      throw new Error("Simulated permanent failure.");
    }

    if (eventType === "user_signed_up") {
      console.log(
        `[consumer] Welcome notification -> ${payload.email || "unknown email"}`,
      );
    } else if (eventType === "order_placed") {
      console.log(
        `[consumer] Order confirmation -> ${payload.orderId || "unknown orderId"}`,
      );
    } else {
      console.log(
        `[consumer] Generic notification for event type: ${eventType}`,
      );
    }

    this.markProcessed(eventId);
    console.log(`[consumer] Event processed successfully: ${eventId}`);

    return { status: "processed", eventId };
  }
}

module.exports = {
  EventProcessor,
  TransientProcessingError,
};
