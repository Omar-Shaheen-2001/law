import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import aiRouter from "./ai";
import sessionsRouter from "./sessions";
import settingsRouter from "./settings";
import reportsRouter from "./reports";
import cronRouter from "./cron";
import poaRouter from "./poa";
import judgmentsRouter from "./judgments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(aiRouter);
router.use(sessionsRouter);
router.use(settingsRouter);
router.use(reportsRouter);
router.use(cronRouter);
router.use(poaRouter);
router.use(judgmentsRouter);

export default router;
