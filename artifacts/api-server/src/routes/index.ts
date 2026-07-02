import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notificationsRouter from "./notifications";
import feedbackRouter from "./feedback";
import adminRouter from "./admin";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(notificationsRouter);
router.use(feedbackRouter);
router.use(adminRouter);
router.use(chatRouter);

export default router;
