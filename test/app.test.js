import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../app.js";

async function startServer(t, app) {
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

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

test("filter daftar biodata dikirim sebagai parameter SQL", async (t) => {
  let query;
  const app = createApp({
    pool: {
      async query(sql, values) {
        query = { sql, values };
        return { rows: [] };
      },
    },
    logger: { log() {}, error() {} },
  });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/biodata?nama=${encodeURIComponent("Budi' OR 1=1 --")}&kelas=A`
  );

  assert.equal(response.status, 200);
  assert.match(query.sql, /nama ILIKE \$1 AND kelas ILIKE \$2/);
  assert.deepEqual(query.values, ["%Budi' OR 1=1 --%", "A"]);
});

test("tolak filter yang tidak dikenal", async (t) => {
  let queried = false;
  const app = createApp({
    pool: {
      async query() {
        queried = true;
        return { rows: [] };
      },
    },
    logger: { log() {}, error() {} },
  });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/biodata?tidakAda=isi`);

  assert.equal(response.status, 400);
  assert.equal(queried, false);
});

test("pagination membatasi hasil dan tetap bisa digabung sama filter", async (t) => {
  let query;
  const app = createApp({
    pool: {
      async query(sql, values) {
        query = { sql, values };
        return { rows: [] };
      },
    },
    logger: { log() {}, error() {} },
  });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/biodata?kelas=A&limit=10&offset=20`
  );

  assert.equal(response.status, 200);
  assert.match(query.sql, /kelas ILIKE \$1 ORDER BY id LIMIT \$2 OFFSET \$3/);
  assert.deepEqual(query.values, ["A", 10, 20]);
  assert.equal(response.headers.get("x-page-limit"), "10");
  assert.equal(response.headers.get("x-page-offset"), "20");
});

test("limit pagination dibatasi sampai 100 data", async (t) => {
  let queried = false;
  const app = createApp({
    pool: {
      async query() {
        queried = true;
        return { rows: [] };
      },
    },
    logger: { log() {}, error() {} },
  });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/biodata?limit=101`);

  assert.equal(response.status, 400);
  assert.equal(queried, false);
});

test("PATCH cuma mengubah field yang dikirim", async (t) => {
  let query;
  const app = createApp({
    pool: {
      async query(sql, values) {
        query = { sql, values };
        return { rowCount: 1, rows: [{ id: 7, nama: "Budi Baru", nim: "23001", kelas: "A" }] };
      },
    },
    logger: { log() {}, error() {} },
  });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/biodata/7`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nama: "Budi Baru" }),
  });

  assert.equal(response.status, 200);
  assert.match(query.sql, /SET nama = \$1\s+WHERE id = \$2/);
  assert.deepEqual(query.values, ["Budi Baru", 7]);
});

test("PATCH nolak body kosong", async (t) => {
  let queried = false;
  const app = createApp({
    pool: {
      async query() {
        queried = true;
        return { rowCount: 0, rows: [] };
      },
    },
    logger: { log() {}, error() {} },
  });
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/biodata/7`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  assert.equal(response.status, 400);
  assert.equal(queried, false);
});

test("POST biodata nyimpen data dan menolak NIM yang tidak valid", async (t) => {
  let query;
  const app = createApp({
    pool: {
      async query(sql, values) {
        query = { sql, values };
        return { rows: [{ id: 8, nama: "Budi", nim: "23001", kelas: "A" }] };
      },
    },
    logger: { log() {}, error() {} },
  });
  const baseUrl = await startServer(t, app);

  const created = await fetch(`${baseUrl}/biodata`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nama: "Budi", nim: "23001", kelas: "A" }),
  });

  assert.equal(created.status, 201);
  assert.match(query.sql, /VALUES \(\$1, \$2, \$3\)/);
  assert.deepEqual(query.values, ["Budi", "23001", "A"]);

  const invalid = await fetch(`${baseUrl}/biodata`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nama: "Budi", nim: "abc", kelas: "A" }),
  });

  assert.equal(invalid.status, 400);
});

test("NIM duplikat dibalas sebagai konflik", async (t) => {
  const app = createApp({
    pool: {
      async query() {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      },
    },
    logger: { log() {}, error() {} },
  });
  const baseUrl = await startServer(t, app);

  const response = await fetch(`${baseUrl}/biodata`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nama: "Budi", nim: "23001", kelas: "A" }),
  });

  assert.equal(response.status, 409);
  assert.equal((await response.json()).message, "NIM sudah terdaftar");
});

test("route detail, PUT, PATCH, dan DELETE balas 404 kalau datanya gak ada", async (t) => {
  const app = createApp({
    pool: {
      async query() {
        return { rowCount: 0, rows: [] };
      },
    },
    logger: { log() {}, error() {} },
  });
  const baseUrl = await startServer(t, app);
  const requests = [
    fetch(`${baseUrl}/biodata/9`),
    fetch(`${baseUrl}/biodata/9`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nama: "Budi", nim: "23001", kelas: "A" }),
    }),
    fetch(`${baseUrl}/biodata/9`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kelas: "B" }),
    }),
    fetch(`${baseUrl}/biodata/9`, { method: "DELETE" }),
  ];

  for (const response of await Promise.all(requests)) {
    assert.equal(response.status, 404);
    assert.equal((await response.json()).message, "Data tidak ditemukan");
  }
});
