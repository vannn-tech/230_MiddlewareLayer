import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../app.js";

test("route daftar biodata pakai format respons yang konsisten", async (t) => {
  const pool = {
    async query() {
      return { rows: [{ id: 1, nama: "Budi", nim: "23001", kelas: "A" }] };
    },
  };
  const app = createApp({ pool, logger: { log() {}, error() {} } });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/biodata`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.deepEqual(body.data, [{ id: 1, nama: "Budi", nim: "23001", kelas: "A" }]);
  assert.equal(body.success, true);
  assert.equal(body.error, null);
});

test("aplikasi gagal jelas kalau pool database tidak disediakan", () => {
  assert.throws(() => createApp(), /Pool database wajib disediakan/);
});

test("setiap request punya id yang sama di header dan log", async (t) => {
  const entries = [];
  const app = createApp({
    pool: { async query() { return { rows: [] }; } },
    logger: { log(entry) { entries.push(entry); }, error() {} },
  });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/biodata`);
  const requestId = response.headers.get("x-request-id");
  await response.text();
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(requestId, /^[0-9a-f-]{36}$/);
  assert.equal(entries[0].requestId, requestId);
});

test("tolak body JSON yang ukurannya kelewat besar", async (t) => {
  const app = createApp({
    pool: { async query() { return { rows: [] }; } },
    logger: { log() {}, error() {} },
  });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/biodata`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nama: "a".repeat(65 * 1024) }),
  });

  assert.equal(response.status, 413);
  assert.equal((await response.json()).message, "Ukuran body terlalu besar");
});

test("health check memastikan database bisa dipakai", async (t) => {
  let query;
  const app = createApp({
    pool: {
      async query(sql) {
        query = sql;
        return { rows: [{ "?column?": 1 }] };
      },
    },
    logger: { log() {}, error() {} },
  });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);

  assert.equal(response.status, 200);
  assert.equal(query, "SELECT 1");
  assert.deepEqual((await response.json()).data, { status: "ok" });
});

test("health check mengembalikan 503 kalau database putus", async (t) => {
  const app = createApp({
    pool: {
      async query() {
        throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
      },
    },
    logger: { log() {}, error() {} },
  });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);

  assert.equal(response.status, 503);
  assert.equal((await response.json()).message, "Database tidak dapat diakses");
});
