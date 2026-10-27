import test from "node:test";
import assert from "node:assert/strict";
import { createConfig } from "../config.js";

test("pakai port default kalau env belum diisi", () => {
  const config = createConfig({});

  assert.equal(config.port, 3000);
  assert.equal(config.database.port, 5432);
});

test("baca port dari env sebagai angka", () => {
  const config = createConfig({ PORT: "8080", DB_PORT: "5433" });

  assert.equal(config.port, 8080);
  assert.equal(config.database.port, 5433);
});

test("tolak port yang bukan angka atau di luar rentang", () => {
  assert.throws(() => createConfig({ PORT: "abc" }), /PORT harus berupa angka/);
  assert.throws(() => createConfig({ DB_PORT: "70000" }), /DB_PORT harus di antara/);
});
