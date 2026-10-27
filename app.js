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
const biodataFields = {
  nama: Joi.string().trim().min(2).max(100),
  nim: Joi.string().trim().pattern(/^\d+$/).min(3).max(20)
    .messages({ "string.pattern.base": '"nim" hanya boleh berisi angka' }),
  kelas: Joi.string().trim().min(1).max(20),
};

const biodataSchema = Joi.object(biodataFields)
  .fork(Object.keys(biodataFields), (schema) => schema.required());
const biodataPatchSchema = Joi.object(biodataFields).min(1);

const idSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const listQuerySchema = Joi.object({
  nama: Joi.string().trim().min(1).max(100),
  kelas: Joi.string().trim().min(1).max(20),
  limit: Joi.number().integer().min(1).max(100),
  offset: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER),
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
  const { error, value } = listQuerySchema.validate(req.query, {
    abortEarly: false,
    convert: true,
    allowUnknown: false,
  });
  if (error) return errorResponse(res, "Parameter tidak valid", 400, formatError(error));

  const conditions = [];
  const values = [];
  if (value.nama) {
    values.push(`%${value.nama}%`);
    conditions.push(`nama ILIKE $${values.length}`);
  }
  if (value.kelas) {
    values.push(value.kelas);
    conditions.push(`kelas ILIKE $${values.length}`);
  }

  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  let sql = `SELECT * FROM biodata${where} ORDER BY id`;
  if (value.limit !== undefined || value.offset !== undefined) {
    const limit = value.limit ?? 20;
    const offset = value.offset ?? 0;
    values.push(limit, offset);
    sql += ` LIMIT $${values.length - 1} OFFSET $${values.length}`;
    res.setHeader("X-Page-Limit", String(limit));
    res.setHeader("X-Page-Offset", String(offset));
  }

  const result = await pool.query(sql, values);
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

// PATCH ubah sebagian data
app.patch("/biodata/:id", validateParams(idSchema), validateBody(biodataPatchSchema), async (req, res) => {
  const { id } = req.params;
  const fields = Object.keys(req.body);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);
  const values = fields.map((field) => req.body[field]);
  values.push(id);

  const result = await pool.query(
    `UPDATE biodata SET ${assignments.join(", ")}
     WHERE id = $${values.length}
     RETURNING *`,
    values
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
