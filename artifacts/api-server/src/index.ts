import { logger } from "./lib/logger";
import app, { initializeApplication } from "./app";

const REQUIRED_ENV = ["DATABASE_URL", "SESSION_SECRET"] as const;
const OPTIONAL_ENV = ["JWT_SECRET", "SOLANA_RPC"] as const;

function envPresence(keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, Boolean(process.env[key])]));
}

function logEnvironmentReadiness() {
  const missingRequired = REQUIRED_ENV.filter((key) => !process.env[key]);
  const missingOptional = OPTIONAL_ENV.filter((key) => !process.env[key]);

  logger.info(
    {
      nodeEnv: process.env.NODE_ENV ?? "development",
      required: envPresence(REQUIRED_ENV),
      optional: envPresence(OPTIONAL_ENV),
    },
    "API environment readiness",
  );

  if (missingRequired.length > 0) {
    logger.error(
      { missingRequired },
      "Required API environment variables are missing",
    );
  }

  if (missingOptional.length > 0) {
    logger.warn(
      { missingOptional },
      "Optional API environment variables are missing",
    );
  }
}

function getPort(): number {
  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  return port;
}

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

async function start() {
  logEnvironmentReadiness();

  const port = getPort();

  const server = app.listen(port, () => {
    logger.info({ port }, "Server listening");

    initializeApplication()
      .then(() => {
        logger.info("API routes initialized");
      })
      .catch((err) => {
        // Keep health checks alive so deployment logs expose the actual cause.
        logger.error({ err }, "API routes failed to initialize");
      });
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

start().catch((err) => {
  logger.fatal({ err }, "API server failed to start");
  process.exit(1);
});
