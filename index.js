import config from "./config.js";
import { pool } from "./db.js";
import { createApp } from "./app.js";

const app = createApp({ pool });
const server = app.listen(config.port, () => {
  console.log(`App running on port ${config.port}.`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Nerima ${signal}, lagi matiin server...`);

  server.close(async (error) => {
    if (error) {
      console.error("Server gagal ditutup dengan rapi:", error.message);
      process.exitCode = 1;
    }

    try {
      await pool.end();
      console.log("Koneksi database sudah ditutup.");
    } catch (poolError) {
      console.error("Koneksi database gagal ditutup:", poolError.message);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

export { app, server };
