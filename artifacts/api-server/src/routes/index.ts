import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketplaceRouter from "./marketplace";
import stripeRouter from "./stripe";
import authRouter from "./auth";
import workspaceRouter from "./workspace";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(workspaceRouter);
router.use(marketplaceRouter);
router.use(stripeRouter);

export default router;
