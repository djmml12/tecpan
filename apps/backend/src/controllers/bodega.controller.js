import {
  getInsumosService,
  getInsumoByIdService,
  createInsumoService,
  updateInsumoService,
  deleteInsumoService,
  registrarCompraService,
  getComprasService,
  ajustarStockService,
  getMovimientosService,
  getRecetaService,
  setRecetaService,
  getProductosConTipoService,
} from "../services/bodega.service.js";

// ── Insumos ───────────────────────────────────────────────────────────────────

export const getInsumos = async (req, res) => {
  try {
    res.json({ success: true, data: await getInsumosService() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const createInsumo = async (req, res) => {
  try {
    res.status(201).json({ success: true, data: await createInsumoService(req.body) });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const updateInsumo = async (req, res) => {
  try {
    res.json({ success: true, data: await updateInsumoService(Number(req.params.id), req.body) });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const deleteInsumo = async (req, res) => {
  try {
    await deleteInsumoService(Number(req.params.id));
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

// ── Compras ───────────────────────────────────────────────────────────────────

export const registrarCompra = async (req, res) => {
  try {
    const data = await registrarCompraService({ insumo_id: Number(req.params.id), ...req.body });
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const getCompras = async (req, res) => {
  try {
    res.json({ success: true, data: await getComprasService(req.params.id ? Number(req.params.id) : null) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Ajuste ────────────────────────────────────────────────────────────────────

export const ajustarStock = async (req, res) => {
  try {
    const { nueva_cantidad, notas } = req.body;
    const data = await ajustarStockService(Number(req.params.id), Number(nueva_cantidad), notas);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const getMovimientos = async (req, res) => {
  try {
    res.json({ success: true, data: await getMovimientosService(Number(req.params.id)) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Recetas ───────────────────────────────────────────────────────────────────

export const getReceta = async (req, res) => {
  try {
    res.json({ success: true, data: await getRecetaService(Number(req.params.producto_id)) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const setReceta = async (req, res) => {
  try {
    await setRecetaService(Number(req.params.producto_id), req.body.ingredientes ?? []);
    res.json({ success: true, data: await getRecetaService(Number(req.params.producto_id)) });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const getProductosConTipo = async (req, res) => {
  try {
    res.json({ success: true, data: await getProductosConTipoService() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
