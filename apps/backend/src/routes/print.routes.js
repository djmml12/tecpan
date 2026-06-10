import { Router } from "express";
import { printReceipt, printSummary, printKitchenTicket, printTest } from "../controllers/print.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = Router();

router.post("/receipt",        authMiddleware, printReceipt);
router.post("/summary",        authMiddleware, printSummary);
router.post("/kitchen-ticket", authMiddleware, printKitchenTicket);
// El test acepta destino ad-hoc desde el body → solo admin (igual que la config de impresora).
router.post("/test",           authMiddleware, authorize("admin"), printTest);

export default router;
