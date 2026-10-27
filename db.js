import pg from "pg";
import config from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  ...config.database,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  console.error("Koneksi database idle bermasalah:", error.code ?? error.message);
});
