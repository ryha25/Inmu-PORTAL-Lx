import { Router, type IRouter } from "express";

const router: IRouter = Router();

function healthPayload() {
  return {
    status: "ok",
    service: "api",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

router.get("/", (_req, res) => {
  res.status(200).json(healthPayload());
});

router.head("/", (_req, res) => {
  res.sendStatus(200);
});

router.get("/healthz", (_req, res) => {
  res.status(200).json(healthPayload());
});

export default router;
