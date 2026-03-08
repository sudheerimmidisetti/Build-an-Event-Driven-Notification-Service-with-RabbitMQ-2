const express = require("express");
const { validateEventPayload } = require("./validation");

function createRoutes({ publisher }) {
  const router = express.Router();

  router.post("/events", async (req, res) => {
    const validationResult = validateEventPayload(req.body);

    if (!validationResult.valid) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.errors,
      });
    }

    try {
      const eventId = await publisher.publishEvent(
        req.body.type.trim(),
        req.body.payload,
      );

      return res.status(202).json({
        status: "accepted",
        eventId,
      });
    } catch (error) {
      console.error("[publisher] Failed to queue event:", error.message);
      return res.status(500).json({
        error: "Failed to queue event",
      });
    }
  });

  return router;
}

module.exports = createRoutes;
