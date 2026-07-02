import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notificationsRouter from "./notifications";
import feedbackRouter from "./feedback";
import adminRouter from "./admin";
import chatRouter from "./chat";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(notificationsRouter);
router.use(feedbackRouter);
router.use(adminRouter);
router.use(chatRouter);
router.use(aiRouter);

export default router;
