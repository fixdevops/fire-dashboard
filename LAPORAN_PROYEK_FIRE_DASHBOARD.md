# Laporan Projek: Fire Fighter System Monitor

**Aplikasi web pemantauan dan kontrol sistem pemadam kebakangan berbasis ESP32**, dengan data realtime melalui **Supabase**, dan antarmuka **Next.js** yang di-*deploy* di **Vercel**.

---

## 1. Ringkasan eksekutif

Projek ini menghubungkan **hardware (ESP32)** ke **basis data cloud (Supabase)**. Halaman **dashboard** membaca data sensor (api, sudut servo, status pompa) secara **langsung (realtime)** dan dapat mengirim perintah **manual** atau **reset WiFi** melalui tabel kontrol. Komunikasi antara web dan ESP **tidak langsung** (bukan WebSocket peer-to-peer); **ESP berbicara dengan Supabase**, begitu juga **browser**—sehingga keduanya sinkron selama memakai **project Supabase dan kunci API yang sama**.

---

## 2. Arsitektur sistem

```
┌─────────────┐    POST/HTTPS     ┌──────────────┐    Realtime + REST    ┌─────────────┐
│   ESP32     │ ───────────────► │  Supabase     │ ◄──────────────────── │   Browser   │
│ sensor,servo│    fire_logs    │  PostgreSQL    │    (Next.js di Vercel)│  dashboard  │
│ relay, WiFi │ ◄── GET/PATCH   │  + Realtime   │                       │             │
└─────────────┘    control       └──────────────┘                       └─────────────┘
```


| Lapisan      | Teknologi                                         | Fungsi                                                                                         |
| ------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Perangkat    | ESP32, WiFiManager, ESP32Servo, HTTPClient        | Baca sensor, kendalikan servo/relay/LED/buzzer, kirim log, baca *flag* reset WiFi              |
| Backend data | Supabase (PostgREST + Realtime)                   | Menyimpan `fire_logs`, menyiarkan perubahan ke client; tabel `control` untuk perintah dari web |
| Frontend     | Next.js 16, React 19, Tailwind CSS 4, Supabase JS | UI monitor, grafik/log, alarm suara & notifikasi                                               |
| Hosting web  | Vercel                                            | Melayani build produksi Next.js                                                                |


---

## 3. Struktur basis data (Supabase)

### 3.1 Tabel `fire_logs`

Menyimpan **riwayat pengukuran** dari ESP (biasanya lewat **INSERT** berulang).


| Kolom        | Tipe (contoh) | Penjelasan                                                                              |
| ------------ | ------------- | --------------------------------------------------------------------------------------- |
| `id`         | `uuid`        | Primary key, sering diisi otomatis                                                      |
| `created_at` | `timestamptz` | Waktu pencatatan                                                                        |
| `flame`      | `boolean`     | `true` jika sensor mendeteksi api (logika di firmware)                                  |
| `relay`      | `boolean`     | Status pompa / relay yang dilaporkan                                                    |
| `angle`      | `integer`     | Sudut servo (derajat) yang dilaporkan                                                   |
| `locked`     | `boolean`     | Opsional; firmware dapat mengirim `false`; pastikan ada **default** jika kolom NOT NULL |


**Realtime:** Supabase dapat menyiarkan `INSERT`/`UPDATE` ke client supaya dashboard berubah tanpa *refresh* penuh.

### 3.2 Tabel `control`

Satu baris operasi (contoh `**id = 1*`*) untuk **perintah dari web ke perangkat** (dibaca oleh ESP jika firmware mendukung).


| Kolom          | Penjelasan                                                                               |
| -------------- | ---------------------------------------------------------------------------------------- |
| `relay`        | Keinginan ON/OFF pompa (mode manual)                                                     |
| `mode`         | `auto` / `manual` (tergantung implementasi firmware)                                     |
| `target_angle` | Sudut target untuk servo                                                                 |
| `updated_at`   | Stempel waktu terakhir diubah                                                            |
| `wifi_reset`   | Jika `true`, ESP dapat menghapus penyimpanan WiFi dan membuka kembali portal konfigurasi |


**Catatan:** Kontrol **tombol/slider di web** menulis ke `control`; **agar hardware benar-benar mengikuti**, firmware harus **membaca** baris ini secara berkala (bukan hanya mengirim `fire_logs`).

---

## 4. Firmware ESP32 (`esp32_fire_system.ino`)

### 4.1 Konfigurasi penting

- `**SUPABASE_URL`** dan `**SUPABASE_KEY` (anon)** harus **sama** dengan variabel lingkungan di Vercel (`NEXT_PUBLIC_SUPABASE_*`).
- **401 Unauthorized** pada Serial saat POST berarti URL/kunci tidak cocok, kunci kedaluwarsa, atau **RLS** menolak—bukan bug servo.

### 4.2 Pin GPIO (contoh konfigurasi saat ini)


| Fungsi                          | Pin |
| ------------------------------- | --- |
| Sensor api (digital, aktif LOW) | 34  |
| Relay pompa                     | 27  |
| LED status                      | 2   |
| Buzzer                          | 14  |
| Servo *scan* (radar)            | 13  |
| Servo *nozzle*                  | 12  |


Relay dikonfigurasi **active LOW** (`RELAY_ON = LOW`).

### 4.3 Perilaku logika

1. **Filter sensor:** beberapa pembacaan berurutan (threshold) untuk mengurangi noise sebelum menyatakan **api terdeteksi**.
2. **Mode api:** relay ON, alarm LED/buzzer berkedip, *nozzle* mengikuti sudut terkini.
3. **Mode aman:** relay OFF, servo *scan* bergerak simetris di sekitar pusat (`center ± range`) dengan pembaruan stabil (**PWM 50 Hz**, interval ~16 ms, tulis servo hanya jika sudut berubah).
4. **Supabase:** secara berkala mengirim JSON ke `/rest/v1/fire_logs` (termasuk `locked: false` jika kolom ada).
5. **WiFi:** WiFiManager dengan SSID hotspot `**FIRE_SYSTEM_FIKRI`**; *reset credential* dapat dipicu dari web lewat `**wifi_reset*`* di `control`.
6. **Jaringan:** *reconnect* berkala jika STA putus; `yield()` + `delay` kecil di *loop* untuk stabilitas stack WiFi.

### 4.4 Daya dan servo

- Servo sebaiknya dipasang dengan **sumber 5 V terpisah** yang memadai, **GND bersama** ESP32, untuk menghindari *jitter* atau *brownout* saat dua servo dan relay bekerja.

---

## 5. Aplikasi web (Next.js)

### 5.1 Dependensi utama

- `next` 16.x, `react` 19.x
- `@supabase/supabase-js` — klien database + Realtime
- `recharts` — komponen grafik (di modul lain bila dipakai)
- `tailwindcss` 4 — gaya tampilan

### 5.2 Variabel lingkungan (Vercel)


| Nama                            | Contoh isi                                       |
| ------------------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://xxxxx.supabase.co`                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *anon public key* dari Supabase → Settings → API |


Keduanya **bukan** rahasia servis sekeras *service role*, tetapi jangan dibocorkan sembarangan; rotasi kunci jika bocor.

### 5.3 Fitur antarmuka (`app/page.tsx` — inti)


| Elemen                              | Sumber data / perilaku                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Badge **Realtime**                  | Status subscribe channel Supabase ke `fire_logs`                                                                                                         |
| Badge **Perangkat online/offline**  | Berdasarkan **waktu `created_at` terakhir** di `fire_logs` (bukan ping WiFi langsung dari browser). Jika tidak ada data baru ~12 detik, dianggap offline |
| Panel **Fire Alert**                | Teks dan warna mengikuti `flame` dari data terbaru                                                                                                       |
| Gauge **Servo**                     | Sudut dari kolom `angle`                                                                                                                                 |
| **Manual Override** (pompa, slider) | Memanggil **PATCH** ke `control` baris `id=1`                                                                                                            |
| **LED Status**                      | Visualisasi dari data (`fire` / `relay`), bukan GPIO fisik                                                                                               |
| **Live Logs**                       | Daftar baris terbaru dari `fire_logs`; baru bertambah saat **INSERT**                                                                                    |
| **Reset WiFi ESP**                  | Men-set `wifi_reset: true` di `control` — **butuh kolom DB + firmware yang membaca flag**                                                                |
| Alarm suara + notifikasi            | Saat `flame` true (perlu interaksi user untuk audio di beberapa browser)                                                                                 |


---

## 6. Keamanan & Row Level Security (RLS)

Supabase memakai **RLS**. Tanpa *policy* yang benar, client dengan *anon key* akan ditolak (401/403).

Umumnya diperlukan (sesuaikan dengan kebijakan Anda):

- `fire_logs`: **SELECT** dan **INSERT** untuk role `anon` (ESP dan dashboard baca; ESP insert).
- `control`: **SELECT** dan **UPDATE** untuk `anon` (web mengubah perintah; ESP membaca).

Untuk produksi, *policy* sebaiknya diperketat (misalnya per `device_id` atau autentikasi pengguna)—versi terbuka hanya cocok untuk **demo/lab**.

---

## 7. *Deployment*

1. **Repositori Git** terhubung ke **Vercel**; setiap push ke branch produksi memicu build.
2. Pastikan **environment variables** diset di Vercel lalu **redeploy** setelah mengubah kunci.
3. URL contoh produksi: `https://fire-dashboard-8uhb.vercel.app/` (dapat berubah sesuai proyek).

---

## 8. Masalah umum & solusi singkat


| Gejala                                | Kemungkinan penyebab                                                   | Tindakan                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| HTTP **401** dari ESP                 | Kunci/URL Supabase salah atau tidak satu project                       | Salin ulang dari Dashboard → API; flash ulang firmware                         |
| Data tidak masuk `fire_logs`          | RLS menolak INSERT                                                     | Tambah/perbaiki *policy* INSERT untuk `anon`                                   |
| Dashboard tidak update live           | Realtime belum aktif untuk tabel `fire_logs`                           | Aktifkan *publication* / replication di Supabase                               |
| “Perangkat offline” padahal ESP hidup | Interval kirim ESP terlalu lama atau WiFi putus                        | Periksa interval POST, log Serial, reconnect                                   |
| Tombol reset WiFi tidak berpengaruh   | Kolom `wifi_reset` belum ada atau ESP tidak poll `control`             | Jalankan SQL kolom + firmware terbaru                                          |
| Servo bergetar                        | Tegangan tidak cukup, tanpa kalibrasi pulsa, atau update terlalu cepat | Catu daya terpisah, sesuaikan `SERVO_MIN_US`/`MAX_US`, jangan *spam* `write()` |


---

## 9. Batasan & pengembangan ke depan

- **Multi-perangkat:** skema saat ini satu aliran `fire_logs`; untuk banyak ESP perlu kolom `**device_id`** dan filter di UI.
- **Sinkron kontrol penuh:** firmware perlu membaca `**control`** (relay, `target_angle`, mode) agar slider web menggerakkan hardware secara konsisten.
- **Autentikasi pengguna** di dashboard belum dibahas di implementasi dasar ini.

---

## 10. Kesimpulan

Sistem ini mengintegrasikan **ESP32** sebagai node sensor/aktuator, **Supabase** sebagai pusat data realtime, dan **Next.js di Vercel** sebagai antarmuka pemantauan. Kelancaran *end-to-end* bergantung pada **kunci API yang konsisten**, **skema tabel + RLS**, **Realtime**, firmware yang **stabil di WiFi**, dan **daya** yang memadai untuk motor servo dan relay.

---

*Dokumen ini menggambarkan konfigurasi dan perilaku sesuai kode di repositori `fire-dashboard` pada saat penyusunan. Sesuaikan URL, kunci, dan nama hotspot jika Anda memakai environment berbeda.*