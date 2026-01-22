
YG PAKE TOKEN BOT GW MEMEK LU PADA
KALO MAU PAKE GANTI TOKEN BOT NYA AMA OWNER 

📦 Ultimate Game Store Bot

https://files.catbox.moe/z5h0d8.png

Sebuah bot Telegram lengkap untuk menjual akun game premium dan script bot otomatis dengan sistem pembayaran terintegrasi.

🎯 Fitur Utama

🛒 Jualan Game Account

· ✅ Akun premium berbagai game (Mobile Legends, PUBG, Free Fire, dll)
· ✅ Email & password langsung setelah pembelian
· ✅ Garansi login 7 hari
· ✅ Etalase produk dengan foto & deskripsi

📦 Jualan Script Bot

· ✅ Upload script bot dalam format .zip, .py, .js
· ✅ File otomatis dikirim ke user setelah pembelian
· ✅ Download counter untuk tracking
· ✅ Support file hingga 50MB

💳 Sistem Pembayaran

· ✅ QRIS - Pembayaran instan
· ✅ Transfer Bank (BCA, BRI, dll)
· ✅ E-Wallet (DANA, OVO, GoPay, ShopeePay)
· ✅ Verifikasi admin manual dengan approve/reject
· ✅ Notifikasi otomatis ke user

👑 Admin Panel Lengkap

· ✅ Tambah/hapus produk game
· ✅ Tambah/hapus script bot
· ✅ Kelola deposit pending
· ✅ Broadcast pesan ke semua user
· ✅ Statistics & reports
· ✅ Maintenance mode

👤 User Features

· ✅ Profile dengan riwayat belanja
· ✅ Saldo digital
· ✅ Level system (Bronze, Silver, Gold)
· ✅ Riwayat transaksi lengkap
· ✅ Topup saldo mudah

🚀 Instalasi

Prerequisites

· Node.js v16 atau lebih tinggi
· Telegram Bot Token dari @BotFather
· Akun Telegram sebagai owner/admin

1. Clone Repository

```bash
git clone https://github.com/arfiputraramadhan/Bot-tele-menu-oke-.git
cd Bot-tele-menu-oke-
```

2. Install Dependencies

```bash
npm install
```

3. Konfigurasi Environment

Buat file .env di root directory:

```env
BOT_TOKEN=your_telegram_bot_token_here
OWNER_ID=your_telegram_user_id_here
BANNER_URL=https://images.unsplash.com/photo-1550745165-9bc0b252726f
QRIS_URL=https://images.unsplash.com/photo-1589666564459-93cdd3c7de32
```

Cara mendapatkan:

· BOT_TOKEN: Chat dengan @BotFather, buat bot baru, copy token
· OWNER_ID: Chat dengan @userinfobot, copy ID Anda
· BANNER_URL & QRIS_URL: URL gambar untuk banner dan QR code (optional)

4. Jalankan Bot

```bash
# Mode development
npm run dev

# Mode production
npm start
```

📁 Struktur File

```
ultimate-game-store-bot/
├── bot.js              # Main bot file
├── database.js         # JSON database system
├── handlers.js         # Message & callback handlers
├── menus.js           # Menu templates & formatting
├── package.json       # Dependencies
├── .env              # Environment variables
├── database.json     # Auto-generated database
└── README.md         # Documentation
```

🗄️ Database Structure

Bot menggunakan JSON database dengan struktur:

```json
{
  "users": [],           // Data user & saldo
  "products": [],        // Produk game account
  "scripts": [],         // Script bot files
  "transactions": [],    // Riwayat transaksi
  "pendingDeposits": [], // Deposit menunggu verifikasi
  "settings": {}         // Bot settings
}
```

🎮 Cara Penggunaan

Untuk User Biasa:

1. Start bot: /start
2. Beli game account:
   · Menu utama → Etalase Game
   · Pilih game → Beli Sekarang
   · Dapatkan email & password langsung
3. Beli script bot:
   · Menu utama → Script Bot
   · Pilih script → Beli Sekarang
   · File otomatis dikirim ke chat
4. Topup saldo:
   · Menu utama → Topup Saldo
   · Pilih metode pembayaran
   · Kirim bukti transfer
   · Tunggu verifikasi admin (1-15 menit)

Untuk Admin/Owner:

1. Akses admin panel: /admin
2. Tambah produk:
   · Admin Panel → Tambah Produk Game
   · Isi data lengkap (nama, harga, login info)
   · Upload foto produk
3. Tambah script bot:
   · Admin Panel → Tambah Script Bot
   · Isi data script
   · Upload file script (.zip/.py/.js)
4. Kelola deposit:
   · Admin Panel → Deposit Pending
   · Approve/reject deposit user
   · Saldo otomatis ditambahkan jika approve
5. Hapus produk/script:
   · Admin Panel → Kelola Produk / Kelola Script
   · Klik tombol "Hapus"
   · Produk langsung terhapus permanen

💰 Sistem Pembayaran

Metode yang Support:

1. QRIS - Instant payment via QR code
2. Bank Transfer - Manual transfer ke rekening
3. E-Wallet - DANA, OVO, GoPay, ShopeePay

Proses Deposit:

```
User request deposit → Pilih metode → Input nominal → 
Kirim bukti → Admin verifikasi → Saldo bertambah
```

Settings Deposit:

· Minimal deposit: Rp 10.000
· Maksimal deposit: Rp 1.000.000
· Dapat diubah di Admin Panel → Settings

🔧 Troubleshooting

Common Issues:

1. Bot tidak jalan
   ```bash
   # Cek token bot
   echo $BOT_TOKEN
   
   # Cek port tidak terpakai
   netstat -tulpn | grep :3000
   ```
2. Database error
   ```bash
   # Hapus database.json untuk reset
   rm database.json
   # Restart bot
   npm start
   ```
3. File script gagal dikirim
   · Pastikan file < 50MB
   · Format file: .zip, .rar, .py, .js
   · Compress ke .zip jika file besar

Logs Monitoring:

```bash
# Live monitoring logs
tail -f bot.log

# Error logs only
grep -i error bot.log
```

📊 Statistics & Analytics

Bot menyediakan statistik lengkap:

· Total users & aktifitas
· Penjualan produk vs script
· Total revenue & deposit
· Download count untuk script
· Pending transactions

🛡️ Security Features

1. Owner-only commands - Hanya owner ID yang bisa akses admin
2. Maintenance mode - Nonaktifkan bot sementara
3. Data validation - Validasi input user
4. JSON database encryption (optional)

📈 Scaling & Optimization

Untuk traffic tinggi:

1. Gunakan database external (MongoDB/MySQL)
2. Implement caching dengan Redis
3. Load balancing multiple bot instances
4. CDN untuk file script besar

Backup database:

```bash
# Backup harian
cp database.json database_backup_$(date +%Y%m%d).json

# Restore backup
cp database_backup_20240101.json database.json
```

🤝 Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

📝 License

MIT License - see LICENSE file

👨‍💻 Author

Ultimate Game Store Team

· Telegram: @sokkk91
· Email: arfiofficial@arfi.web.id
· Website: https://arfi.web.id

🙏 Support

Jika bot ini membantu bisnis Anda, pertimbangkan untuk:

· ⭐ Star repository ini
· 🐛 Laporkan bug/issues
· 💡 Suggest new features
· 📢 Share dengan teman

---

⭐ Jika Anda suka project ini, jangan lupa kasih star! ⭐

```
📊 Stats: 1000+ Users | 500+ Products | 24/7 Support
🎯 Mission: Membuat jualan game & script lebih mudah!
🚀 Version: 3.0.0 (Stable Release)
```

🚀 Quick Start Commands

```bash
# Install & run
. pkg update && pkg upgrade
. pkg install git
. git clone https://github.com/arfiputraramadhan/Bot-tele-menu-oke-.git
. pkg install nodejs
. cd Bot-tele-menu-oke- && npm install
. nano .env  # Edit config, lalu:
. npm install
. npm start
```

Happy Selling! 🎮📦
