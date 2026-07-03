import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notificationsRouter from "./notifications";
import feedbackRouter from "./feedback";
import adminRouter from "./admin";
import adminAiRouter from "./admin-ai";
import chatRouter from "./chat";
import aiRouter from "./ai";
import generatedDocumentsRouter from "./generated-documents";
import userRouter from "./user";
import knowledgeRouter from "./knowledge";

const router: IRouter = Router();

router.use(healthRouter);
router.use(notificationsRouter);
router.use(feedbackRouter);
router.use(adminRouter);
router.use(adminAiRouter);
router.use(chatRouter);
router.use(aiRouter);
router.use(generatedDocumentsRouter);
router.use(userRouter);
router.use(knowledgeRouter);

export default router;
