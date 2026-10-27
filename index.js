import config from "./config.js";
import { pool } from "./db.js";
import { createApp } from "./app.js";

const app = createApp({ pool });
const server = app.listen(config.port, () => {
  console.log(`App running on port ${config.port}.`);
});

export { app, server };
