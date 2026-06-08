import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminAuthRouter from "./admin-auth";
import dashboardRouter from "./dashboard";
import transactionsRouter from "./transactions";
import balanceRouter from "./balance";
import jarsRouter from "./jars";
import goalsRouter from "./goals";
import rewardsRouter from "./rewards";
import notificationsRouter from "./notifications";
import communityRouter from "./community";
import rankingRouter from "./ranking";
import profileRouter from "./profile";
import pointsRouter from "./points";
import adminRouter from "./admin";
import solanaRouter from "./solana";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(adminAuthRouter);
router.use(dashboardRouter);
router.use(transactionsRouter);
router.use(balanceRouter);
router.use(jarsRouter);
router.use(goalsRouter);
router.use(rewardsRouter);
router.use(notificationsRouter);
router.use(communityRouter);
router.use(rankingRouter);
router.use(profileRouter);
router.use(pointsRouter);
router.use(adminRouter);
router.use(solanaRouter);

export default router;
