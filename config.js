import "dotenv/config";

function readPort(value, fallback, name) {
  if (value === undefined || value === "") return fallback;

  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} harus berupa angka`);
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} harus di antara 1 dan 65535`);
  }

  return port;
}

export function createConfig(env = process.env) {
  return {
    port: readPort(env.PORT, 3000, "PORT"),
    database: {
      user: env.DB_USER,
      host: env.DB_HOST,
      database: env.DB_NAME,
      password: env.DB_PASSWORD,
      port: readPort(env.DB_PORT, 5432, "DB_PORT"),
    },
  };
}

const config = createConfig();

export default config;
