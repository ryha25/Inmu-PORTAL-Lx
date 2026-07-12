import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./middlewares/session";
import { deleteInactiveUsers } from "./routes/auth";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function scheduleInactiveUserCleanup() {
  const runCleanup = () => {
    deleteInactiveUsers().catch((err) => {
      logger.error({ err }, "Inactive user cleanup failed");
    });
  };

  const initialDelayMs = Number(
    process.env.INACTIVE_USER_CLEANUP_DELAY_MS ?? 5 * 60 * 1000,
  );

  const initialTimer = setTimeout(runCleanup, Math.max(0, initialDelayMs));
  initialTimer.unref?.();

  const interval = setInterval(runCleanup, TWENTY_FOUR_HOURS);
  interval.unref?.();
}

scheduleInactiveUserCleanup();

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const explicitOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

function isOriginAllowed(origin: string): boolean {
  if (explicitOrigins.length > 0) return explicitOrigins.includes(origin);
  return (
    /^https:\/\/[a-zA-Z0-9-]+\.replit\.dev$/.test(origin) ||
    /^https:\/\/[a-zA-Z0-9-]+\.repl\.co$/.test(origin) ||
    origin === "http://localhost:5173" ||
    origin === "http://localhost:3000"
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, isOriginAllowed(origin));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sessionMiddleware);

app.use("/api", router);

export default app;
