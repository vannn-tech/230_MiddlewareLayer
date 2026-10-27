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
  assert.deepEqual(body.data, [{ id: 1, nama: "Budi", nim: "23001", kelas: "A" }]);
  assert.equal(body.success, true);
  assert.equal(body.error, null);
});

test("aplikasi gagal jelas kalau pool database tidak disediakan", () => {
  assert.throws(() => createApp(), /Pool database wajib disediakan/);
});
