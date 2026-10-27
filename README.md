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

Server jalan di port `3000` secara default. Port bisa diganti lewat variabel
`PORT`.

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
| DELETE | `/biodata/:id` | Hapus biodata |

Body untuk tambah dan ubah data berupa JSON:

```json
{
  "nama": "Budi",
  "nim": "23001",
  "kelas": "A"
}
```

Respons API punya format yang sama: `success`, `message`, `data`, dan `error`.
