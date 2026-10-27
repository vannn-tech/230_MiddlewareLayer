import { randomUUID } from "node:crypto";
import express from "express";
import Joi from "joi";

export function createApp({ pool, logger = console } = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("Pool database wajib disediakan");
  }

const app = express();

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb", parameterLimit: 100 }));

// ===== Middleware Logging =====
// Mencatat method, url, status code, dan lama proses setiap request
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.log({
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${Date.now() - start} ms`,
    });
  });
  next();
});

// ===== Response Envelope =====
// Semua respons memakai format yang sama: { success, message, data, error }
function successResponse(res, message, data, status = 200) {
  return res.status(status).json({ success: true, message, data, error: null });
}

function errorResponse(res, message, status, details = null) {
  return res.status(status).json({ success: false, message, data: null, error: details });
}

// ===== Joi Validation Schema =====
const biodataSchema = Joi.object({
  nama: Joi.string().trim().min(2).max(100).required(),
  nim: Joi.string().trim().pattern(/^\d+$/).min(3).max(20).required()
    .messages({ "string.pattern.base": '"nim" hanya boleh berisi angka' }),
  kelas: Joi.string().trim().min(1).max(20).required(),
});

const idSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const formatError = (error) =>
  error.details.map((item) => ({ field: item.path.join("."), message: item.message }));

// ===== Middleware Validasi =====
function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body ?? {}, {
      abortEarly: false,
      convert: true,
      allowUnknown: false,
    });
    if (error) return errorResponse(res, "Validasi Input Gagal", 400, formatError(error));
    req.body = value;
    next();
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      convert: true,
      allowUnknown: false,
    });
    if (error) return errorResponse(res, "Parameter tidak valid", 400, formatError(error));
    req.params = value;
    next();
  };
}

// ===== Routes =====

// Cek aplikasi sekaligus koneksi database
app.get("/health", async (req, res) => {
  await pool.query("SELECT 1");
  return successResponse(res, "Server dan database siap", { status: "ok" });
});

// GET semua data
app.get(["/", "/biodata"], async (req, res) => {
  const result = await pool.query("SELECT * FROM biodata ORDER BY id");
  return successResponse(res, "Data berhasil diambil", result.rows);
});

// GET satu data berdasarkan id
app.get("/biodata/:id", validateParams(idSchema), async (req, res) => {
  const result = await pool.query("SELECT * FROM biodata WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return errorResponse(res, "Data tidak ditemukan", 404);
  return successResponse(res, "Data berhasil diambil", result.rows[0]);
});

// POST tambah data
app.post("/biodata", validateBody(biodataSchema), async (req, res) => {
  const { nama, nim, kelas } = req.body;
  const result = await pool.query(
    `INSERT INTO biodata (nama, nim, kelas)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [nama, nim, kelas]
  );
  return successResponse(res, "Data berhasil ditambahkan", result.rows[0], 201);
});

// PUT ubah data
app.put("/biodata/:id", validateParams(idSchema), validateBody(biodataSchema), async (req, res) => {
  const { id } = req.params;
  const { nama, nim, kelas } = req.body;
  const result = await pool.query(
    `UPDATE biodata SET nama = $1, nim = $2, kelas = $3
     WHERE id = $4
     RETURNING *`,
    [nama, nim, kelas, id]
  );
  if (result.rowCount === 0) return errorResponse(res, "Data tidak ditemukan", 404);
  return successResponse(res, "Data berhasil diupdate", result.rows[0]);
});

// DELETE hapus data
app.delete("/biodata/:id", validateParams(idSchema), async (req, res) => {
  const result = await pool.query("DELETE FROM biodata WHERE id = $1 RETURNING *", [req.params.id]);
  if (result.rowCount === 0) return errorResponse(res, "Data tidak ditemukan", 404);
  return successResponse(res, "Data berhasil dihapus", result.rows[0]);
});

// ===== Jika route tidak ditemukan =====
app.use((req, res) => {
  return errorResponse(res, "Endpoint tidak ditemukan", 404);
});

// ===== Global error handler =====
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // JSON di body rusak (misalnya koma berlebih)
  if (err.type === "entity.parse.failed") {
    return errorResponse(res, "Format JSON tidak valid", 400);
  }
  if (err.type === "entity.too.large") {
    return errorResponse(res, "Ukuran body terlalu besar", 413);
  }
  // PostgreSQL: pelanggaran UNIQUE (NIM kembar)
  if (err.code === "23505") {
    return errorResponse(res, "NIM sudah terdaftar", 409);
  }
  // Database tidak bisa diakses
  if (["ECONNREFUSED", "ENOENT", "ETIMEDOUT", "ENOTFOUND", "28P01", "3D000", "42P01"].includes(err.code)) {
    logger.error(err);
    return errorResponse(res, "Database tidak dapat diakses", 503);
  }

  logger.error(err);
  return errorResponse(res, "Terjadi Kesalahan pada Server", 500);
});

  return app;
}
