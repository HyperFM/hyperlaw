import { Router, type IRouter } from "express";
import authRouter from "./auth";
import webauthnLoginRouter from "./webauthnLogin";
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
import stripeRouter from "./stripe";
import appleIapRouter from "./appleIap";
import casesRouter from "./cases";
import securityRouter from "./security";
import ifpRouter from "./ifp";
import exhibitRouter from "./exhibit";
import tutorRouter from "./tutor";
import transcriptRouter from "./transcript";
import hearingScriptsRouter from "./hearing-scripts";
import intakeRouter from "./intake";
import caseChatRouter from "./case-chat";
import remindersRouter from "./reminders";
import voirDireRouter from "./voir-dire";
import familyRouter from "./family";

import { aiDailyCap } from "../services/aiCap.js";

const router: IRouter = Router();

// Daily cap on every model-calling route (see services/aiCap.ts).
router.use(aiDailyCap);

router.use(authRouter);
router.use(webauthnLoginRouter);
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
router.use(stripeRouter);
router.use(appleIapRouter);
router.use(casesRouter);
router.use(securityRouter);
router.use(ifpRouter);
router.use(exhibitRouter);
router.use(tutorRouter);
router.use(transcriptRouter);
router.use(hearingScriptsRouter);
router.use(intakeRouter);
router.use(caseChatRouter);
router.use(remindersRouter);
router.use(voirDireRouter);
router.use(familyRouter);

export default router;
