const express = require("express");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const EventPublisher = require("./publisher");
const createRoutes = require("./routes");

dotenv.config();

function buildApp({ publisher }) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  const limiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
    max: Number(process.env.RATE_LIMIT_MAX || 60),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many requests, please try again later.",
    },
  });

  app.use("/api/events", limiter);

  app.get("/health", (_req, res) => {
    const rabbitmqConnected = publisher ? publisher.isReady() : false;

    if (!rabbitmqConnected) {
      return res.status(503).json({
        status: "degraded",
        rabbitmq: "disconnected",
      });
    }

    return res.status(200).json({
      status: "ok",
      rabbitmq: "connected",
    });
  });

  app.use("/api", createRoutes({ publisher }));

  app.use((error, _req, res, _next) => {
    console.error("[publisher] Unhandled API error:", error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

async function startServer() {
  const publisher = new EventPublisher();
  const port = Number(process.env.API_PORT || 8000);

  await publisher.connect();

  const app = buildApp({ publisher });
  const server = app.listen(port, () => {
    console.log(`[publisher] API listening on port ${port}`);
  });

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(
      `[publisher] Received ${signal}. Starting graceful shutdown...`,
    );

    server.close(async () => {
      try {
        await publisher.close();
        process.exit(0);
      } catch (error) {
        console.error("[publisher] Graceful shutdown failed:", error);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error("[publisher] Forced shutdown due to timeout.");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return { app, server, publisher };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("[publisher] Failed to start service:", error);
    process.exit(1);
  });
}

module.exports = {
  buildApp,
  startServer,
};
