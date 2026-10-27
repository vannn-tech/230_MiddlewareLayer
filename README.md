# CRUD Middleware

API sederhana buat ngelola data biodata pakai Express dan PostgreSQL.

## Mulai jalanin

Pakai Node.js 20 atau lebih baru. Install dependency dulu:

```bash
npm install
```

Isi konfigurasi database di file `.env`, lalu nyalakan aplikasinya:

```bash
npm start
```

Contoh variabelnya ada di `.env.example`. Server jalan di port `3000` secara
default; port bisa diganti lewat variabel `PORT`.

Jalankan tes tanpa perlu nyambung ke database:

```bash
npm test
```

## Siapin tabel

Bikin tabel `biodata` di database PostgreSQL:

```sql
CREATE TABLE biodata (
  id SERIAL PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  nim VARCHAR(20) NOT NULL UNIQUE,
  kelas VARCHAR(20) NOT NULL
);
```

## Route yang tersedia

| Method | Route | Kegunaan |
| --- | --- | --- |
| GET | `/` atau `/biodata` | Ambil semua biodata |
| GET | `/biodata/:id` | Ambil satu biodata |
| POST | `/biodata` | Tambah biodata |
| PUT | `/biodata/:id` | Ganti biodata |
| PATCH | `/biodata/:id` | Ubah sebagian field biodata |
| DELETE | `/biodata/:id` | Hapus biodata |
| GET | `/health` | Cek server dan koneksi database |

Daftar biodata bisa dicari dan dipaginasi, contohnya:

```text
GET /biodata?nama=budi&kelas=A&limit=10&offset=0
```

`nama` dicari sebagian, sedangkan `kelas` dicari tanpa membedakan huruf besar
atau kecil. `limit` boleh dari `1` sampai `100`, dan `offset` mulai dari `0`.
Kalau pagination dipakai tanpa `limit`, batas default-nya `20`. Batas dan posisi
halaman juga dikirim lewat header `X-Page-Limit` dan `X-Page-Offset`.

Untuk `PATCH`, kirim satu atau lebih field yang mau diubah. Body kosong bakal
ditolak.

Body untuk tambah dan ubah data berupa JSON:

```json
{
  "nama": "Budi",
  "nim": "23001",
  "kelas": "A"
}
```

Respons API punya format yang sama: `success`, `message`, `data`, dan `error`.
