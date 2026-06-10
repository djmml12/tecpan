import { Router } from "express";
import {
  getPrinterConfig,
  updatePrinterConfig,
  getBarPrinterConfig,
  updateBarPrinterConfig,
  getPrinterMode,
  updatePrinterMode,
  getTipPercentage,
  updateTipPercentage,
  getEmailAlertConfig,
  updateEmailAlertConfig,
  sendEmailAlertTest,
  resetEmailAlertStates,
  triggerInventoryAlerts,
  getEmailOutboxStatus,
  getTouchKeyboardConfig,
  updateTouchKeyboardConfig,
  getStockAlertThresholds,
  updateStockAlertThresholds,
  getOrderNamingConfig,
  updateOrderNamingConfig,
} from "../controllers/settings.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = Router();

router.get("/printer", authMiddleware, getPrinterConfig);
router.put("/printer", authMiddleware, authorize("admin"), updatePrinterConfig);
router.post("/printer", authMiddleware, authorize("admin"), updatePrinterConfig);

router.get("/printer-bar", authMiddleware, getBarPrinterConfig);
router.put("/printer-bar", authMiddleware, authorize("admin"), updateBarPrinterConfig);
router.post("/printer-bar", authMiddleware, authorize("admin"), updateBarPrinterConfig);

router.get("/printer-mode", authMiddleware, getPrinterMode);
router.put("/printer-mode", authMiddleware, authorize("admin"), updatePrinterMode);
router.post("/printer-mode", authMiddleware, authorize("admin"), updatePrinterMode);

router.get("/tip", authMiddleware, getTipPercentage);
router.post("/tip", authMiddleware, authorize("admin"), updateTipPercentage);
router.put("/tip", authMiddleware, authorize("admin"), updateTipPercentage);
router.get("/email-alerts", authMiddleware, authorize("admin"), getEmailAlertConfig);
router.post("/email-alerts", authMiddleware, authorize("admin"), updateEmailAlertConfig);
router.put("/email-alerts", authMiddleware, authorize("admin"), updateEmailAlertConfig);
router.post("/email-alerts/test", authMiddleware, authorize("admin"), sendEmailAlertTest);
router.post("/email-alerts/reset-states", authMiddleware, authorize("admin"), resetEmailAlertStates);
router.post("/email-alerts/trigger", authMiddleware, authorize("admin"), triggerInventoryAlerts);
router.get("/email-alerts/outbox-status", authMiddleware, authorize("admin"), getEmailOutboxStatus);
router.get("/touch-keyboard", authMiddleware, getTouchKeyboardConfig);
router.post("/touch-keyboard", authMiddleware, authorize("admin"), updateTouchKeyboardConfig);
router.put("/touch-keyboard", authMiddleware, authorize("admin"), updateTouchKeyboardConfig);
router.get("/stock-thresholds", authMiddleware, getStockAlertThresholds);
router.post("/stock-thresholds", authMiddleware, authorize("admin"), updateStockAlertThresholds);
router.put("/stock-thresholds", authMiddleware, authorize("admin"), updateStockAlertThresholds);

router.get("/order-naming", authMiddleware, getOrderNamingConfig);
router.post("/order-naming", authMiddleware, authorize("admin"), updateOrderNamingConfig);
router.put("/order-naming", authMiddleware, authorize("admin"), updateOrderNamingConfig);

export default router;
