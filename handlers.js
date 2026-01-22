const menus = require('./menus');
const { db } = require('./database');

// Fungsi logging detail
const logAction = (action, userId, details = {}) => {
    const timestamp = new Date().toLocaleString('id-ID');
    console.log(`\n📋 [${timestamp}] HANDLER LOG`);
    console.log(`👤 User: ${userId}`);
    console.log(`🎯 Action: ${action}`);
    console.log(`📊 Details:`, details);
    console.log(`─`.repeat(50));
};

const handlers = {
    formatRp: menus.formatRp,
    
    async showMainMenu(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_MAIN_MENU', userId, {
                username: ctx.from.username,
                firstName: ctx.from.first_name
            });
            
            const user = await db.getUser(userId, ctx.from);
            const isOwner = userId.toString() === process.env.OWNER_ID;
            const settings = await db.getSettings();
            
            if (settings.maintenance && !isOwner) {
                console.log(`🔧 Maintenance mode active for user ${userId}`);
                return await ctx.reply(
                    '🔧 BOT SEDANG DALAM PERBAIKAN\n\n' +
                    'Mohon maaf, bot sedang dalam maintenance.\n' +
                    'Silakan coba lagi nanti.\n\n' +
                    'Untuk info lebih lanjut hubungi admin.'
                );
            }
            
            const menu = await menus.main(user, isOwner);
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showMainMenu:', error.message);
            await this.sendSimpleMenu(ctx, '🎮 ULTIMATE GAME STORE 🎮\n\nGunakan tombol di bawah untuk navigasi:', [
                [{ text: '🛒 Etalase Game', callback_data: 'nav_shop' }],
                [{ text: '📦 Script Bot', callback_data: 'nav_scripts' }],
                [{ text: '💳 Topup Saldo', callback_data: 'nav_deposit' }],
                [{ text: '👤 Profile', callback_data: 'nav_profile' }],
                [{ text: '📢 Info', callback_data: 'nav_info' }]
            ]);
        }
    },
    
    async showShop(ctx, page = 0) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_SHOP', userId, { page });
            
            const menu = await menus.shop(page);
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showShop:', error);
            await ctx.reply('❌ Error loading products.');
        }
    },
    
    async showScriptsMenu(ctx, page = 0) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_SCRIPTS', userId, { page });
            
            const menu = await menus.scripts(page);
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showScriptsMenu:', error);
            await ctx.reply('❌ Error loading scripts.');
        }
    },
    
    async showAdminPanel(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_ADMIN_PANEL', userId);
            
            if (userId.toString() !== process.env.OWNER_ID) {
                await ctx.answerCbQuery('❌ Akses ditolak! Hanya owner.', { show_alert: true });
                return;
            }
            
            const menu = await menus.admin();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showAdminPanel:', error);
            await ctx.reply('❌ Error loading admin panel.');
        }
    },
    
    async showDepositMenu(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_DEPOSIT_MENU', userId);
            
            const user = await db.getUser(ctx.from.id, ctx.from);
            const settings = await db.getSettings();
            const menu = await menus.deposit(user, settings);
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showDepositMenu:', error);
            await this.sendSimpleMenu(ctx, '💳 TOPUP SALDO\n\nHanya tersedia deposit via QRIS Atlantic:', [
                [{ text: '📱 QRIS (ATLANTIC)', callback_data: 'deposit_method_qris' }],
                [{ text: '📋 Cara Deposit', callback_data: 'deposit_guide' }],
                [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
            ]);
        }
    },
    
    async showAtlanticQRIS(ctx, amount, depositId, atlanticData) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_ATLANTIC_QRIS', userId, {
                amount,
                depositId,
                atlanticId: atlanticData.id
            });
            
            console.log('🔄 Showing Atlantic QRIS for deposit:', depositId);
            
            const expiredTime = atlanticData.expired_at ? 
                new Date(atlanticData.expired_at).toLocaleString('id-ID') : 
                '30 menit dari sekarang';
            
            const buttons = [
                [{ text: '🔄 Cek Status', callback_data: `check_atlantic_${depositId}` }],
                [{ text: '🚀 Start Auto-Check', callback_data: `auto_check_atlantic_${depositId}` }],
                [{ text: '❌ Batalkan', callback_data: `cancel_atlantic_${depositId}` }],
                [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
            ];
            
            const detailsMessage = await ctx.reply(
                `*📋 DEPOSIT DETAILS*\n\n` +
                `💵 *Nominal:* ${this.formatRp(amount)}\n` +
                `🆔 *Deposit ID:* \`${depositId}\`\n` +
                `🔗 *Atlantic ID:* \`${atlanticData.id}\`\n` +
                `⏰ *Batas Waktu:* ${expiredTime}\n` +
                `📊 *Status:* Menunggu Pembayaran\n\n` +
                `🔄 *Sistem otomatis akan mengecek pembayaran Anda.*\n` +
                `🚀 *Klik "Start Auto-Check" untuk verifikasi cepat!*\n` +
                `Menggenerating QR code...`,
                {
                    parse_mode: 'Markdown'
                }
            );
            
            let qrMessage = null;
            
            if (atlanticData.qr_string) {
                try {
                    console.log('📤 Generating QR code from string...');
                    
                    const statusMessage = await ctx.reply('🔄 Sedang membuat QR code...');
                    
                    const QRCode = require('qrcode');
                    const qrBuffer = await QRCode.toBuffer(atlanticData.qr_string, {
                        errorCorrectionLevel: 'H',
                        type: 'png',
                        margin: 2,
                        width: 400,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        }
                    });
                    
                    qrMessage = await ctx.replyWithPhoto(
                        { source: qrBuffer },
                        {
                            caption: `💳 QRIS PAYMENT\n\n` +
                                   `💰 ${this.formatRp(amount)}\n` +
                                   `⏰ ${expiredTime}\n` +
                                   `🆔 ${depositId.substring(0, 10)}...\n` +
                                   `🚀 Sistem auto-check aktif!\n` +
                                   `📱 Scan & bayar sekarang`,
                            reply_markup: { inline_keyboard: buttons }
                        }
                    );
                    
                    try {
                        await ctx.deleteMessage(statusMessage.message_id);
                    } catch (e) {
                        console.warn('⚠️ Gagal menghapus pesan status:', e.message);
                    }
                    
                } catch (photoError) {
                    console.error('❌ Error sending QR image:', photoError.message);
                    qrMessage = await this.sendQRStringFallback(ctx, amount, depositId, atlanticData, buttons);
                }
            } else if (atlanticData.qr_image && atlanticData.qr_image.includes('atlantich2h.com')) {
                try {
                    qrMessage = await ctx.replyWithPhoto(atlanticData.qr_image, {
                        caption: `💳 QRIS PAYMENT\n\n` +
                               `💰 ${this.formatRp(amount)}\n` +
                               `⏰ ${expiredTime}\n` +
                               `🆔 ${depositId.substring(0, 10)}...\n` +
                               `🚀 Sistem auto-check aktif!\n` +
                               `📱 Scan & bayar sekarang`,
                        reply_markup: { inline_keyboard: buttons }
                    });
                } catch (photoError) {
                    console.error('❌ Error sending QR image from URL:', photoError.message);
                    qrMessage = await this.sendQRStringFallback(ctx, amount, depositId, atlanticData, buttons);
                }
            } else {
                await ctx.reply(
                    `❌ QR CODE TIDAK TERSEDIA\n\n` +
                    `Deposit berhasil dibuat di Atlantic, tapi QR code tidak tersedia.\n` +
                    `Deposit ID: \`${depositId}\`\n` +
                    `Atlantic ID: \`${atlanticData.id}\`\n\n` +
                    `Silakan hubungi admin untuk bantuan.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '👑 Hubungi Admin', url: 'https://t.me/sokkk91' }],
                                [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                            ]
                        }
                    }
                );
            }
            
            const instructionMessage = await this.sendAdditionalInstructions(ctx, amount, depositId);
            
            const messagesToDelete = [];
            if (detailsMessage && detailsMessage.message_id) messagesToDelete.push(detailsMessage.message_id);
            if (qrMessage && qrMessage.message_id) messagesToDelete.push(qrMessage.message_id);
            if (instructionMessage && instructionMessage.message_id) messagesToDelete.push(instructionMessage.message_id);
            
            return {
                message_id: qrMessage ? qrMessage.message_id : null,
                all_message_ids: messagesToDelete
            };
            
        } catch (error) {
            console.error('❌ Error in showAtlanticQRIS:', error);
            
            await ctx.reply(
                `*💳 DEPOSIT BERHASIL DIBUAT*\n\n` +
                `💰 Nominal: ${this.formatRp(amount)}\n` +
                `🆔 Deposit ID: \`${depositId}\`\n` +
                `🔗 Atlantic ID: \`${atlanticData?.id || 'N/A'}\`\n` +
                `⏰ Status: Menunggu Pembayaran\n\n` +
                `⚠️ QR code gagal ditampilkan.\n` +
                `Silakan hubungi admin untuk QR code manual.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Cek Status', callback_data: `check_atlantic_${depositId}` }],
                            [{ text: '🚀 Start Auto-Check', callback_data: `auto_check_atlantic_${depositId}` }],
                            [{ text: '👑 Hubungi Admin', url: 'https://t.me/sokkk91' }]
                        ]
                    }
                }
            );
            
            return { message_id: null, all_message_ids: [] };
        }
    },
    
    async sendQRStringFallback(ctx, amount, depositId, atlanticData, buttons) {
        const qrString = atlanticData.qr_string || '';
        const expiredTime = atlanticData.expired_at ? 
            new Date(atlanticData.expired_at).toLocaleString('id-ID') : 
            '30 menit';
        
        const message = await ctx.reply(
            `*🔗 QRIS VIA STRING*\n\n` +
            `💵 Nominal: ${this.formatRp(amount)}\n` +
            `🆔 Deposit ID: \`${depositId}\`\n` +
            `⏰ Batas Waktu: ${expiredTime}\n\n` +
            `*QR STRING:*\n\`${qrString}\`\n\n` +
            `*📋 Cara Pakai:*\n` +
            `1. Salin kode di atas\n` +
            `2. Tempel di aplikasi e-wallet\n` +
            `3. Bayar ${this.formatRp(amount)}\n` +
            `4. Klik "🚀 Start Auto-Check" untuk verifikasi cepat\n\n` +
            `🚀 *Auto-check system aktif!*`,
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
        
        return message;
    },
    
    async sendAdditionalInstructions(ctx, amount, depositId) {
        const message = await ctx.reply(
            `*📋 INSTRUKSI LENGKAP*\n\n` +
            `1. 📱 Buka aplikasi e-wallet/mobile banking\n` +
            `2. 🔍 Cari menu "Scan QR Code"\n` +
            `3. 📷 Arahkan kamera ke QR code\n` +
            `4. 💰 Bayar tepat ${this.formatRp(amount)}\n` +
            `5. ✅ Klik tombol "🚀 Start Auto-Check"\n\n` +
            `*🚀 AUTO-CHECK SYSTEM:*\n` +
            `• Sistem otomatis mengecek setiap 3 detik\n` +
            `• Saldo otomatis bertambah jika berhasil\n` +
            `• Notifikasi langsung ke Anda\n` +
            `• Berjalan selama 5 menit\n\n` +
            `*⏰ WAKTU PROSES:*\n` +
            `• Instan - 30 detik\n` +
            `• Saldo otomatis bertambah\n\n` +
            `*🆘 TROUBLESHOOTING:*\n` +
            `• QR tidak bisa discan? Screenshot dan scan dari galeri\n` +
            `• Sudah bayar tapi pending? Tunggu 30 detik lalu klik "Start Auto-Check"\n` +
            `• Masih error? Hubungi admin @sokkk91`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❓ Cara Scan QR', callback_data: 'qris_guide' }],
                        [{ text: '🚀 Start Auto-Check', callback_data: `auto_check_atlantic_${depositId}` }],
                        [{ text: '🔄 Cek Status', callback_data: `check_atlantic_${depositId}` }]
                    ]
                }
            }
        );
        
        return message;
    },
    
    async sendAutoCheckNotification(ctx, depositId, amount) {
        try {
            await ctx.reply(
                `🚀 AUTO-CHECK DIAKTIFKAN!\n\n` +
                `Sistem akan otomatis mengecek pembayaran Anda.\n` +
                `💰 Nominal: ${this.formatRp(amount)}\n` +
                `🆔 Deposit ID: ${depositId}\n\n` +
                `📱 Silakan scan QR code dan bayar sekarang.\n` +
                `✅ Saldo akan otomatis masuk jika pembayaran berhasil.\n\n` +
                `⏳ Auto-check berjalan selama 5 menit.`
            );
        } catch (error) {
            console.error('Error sending auto-check notification:', error);
        }
    },
    
    async showProfile(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_PROFILE', userId);
            
            const user = await db.getUser(ctx.from.id, ctx.from);
            const menu = await menus.profile(user);
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showProfile:', error);
            const user = await db.getUser(ctx.from.id, ctx.from);
            await ctx.reply(
                `👤 PROFILE\n\n` +
                `Nama: ${user.first_name}\n` +
                `Saldo: ${this.formatRp(user.balance)}\n` +
                `Level: ${user.level}`
            );
        }
    },
    
    async showInfoMenu(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_INFO_MENU', userId);
            
            const menu = await menus.info();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showInfoMenu:', error);
            await ctx.reply('📢 INFO\n\nJam operasional: 24/7\nSupport: @sokkk91');
        }
    },
    
    async showPurchaseHistory(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_PURCHASE_HISTORY', userId);
            
            const user = await db.getUser(ctx.from.id, ctx.from);
            const menu = await menus.purchaseHistory(user);
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showPurchaseHistory:', error);
            await ctx.reply('📜 Anda belum memiliki riwayat belanja.');
        }
    },
    
    async showProfileSettings(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_PROFILE_SETTINGS', userId);
            
            const menu = await menus.profileSettings();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showProfileSettings:', error);
            await ctx.reply('⚙️ Pengaturan profile sedang dalam pengembangan.');
        }
    },
    
    async showProfileUpdate(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_PROFILE_UPDATE', userId);
            
            const menu = await menus.profileUpdate();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showProfileUpdate:', error);
            await ctx.reply('🔄 Update profile melalui settings Telegram Anda.');
        }
    },
    
    async showDepositGuide(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_DEPOSIT_GUIDE', userId);
            
            const menu = await menus.depositGuide();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showDepositGuide:', error);
            await ctx.reply('📋 Cara deposit: Pilih menu Topup → Pilih QRIS → Ikuti instruksi.');
        }
    },
    
    async showAdminManageProducts(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_ADMIN_MANAGE_PRODUCTS', userId);
            
            if (ctx.from.id.toString() !== process.env.OWNER_ID) {
                await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
                return;
            }
            
            const menu = await menus.adminManageProducts();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showAdminManageProducts:', error);
            await ctx.reply('📦 Tidak ada produk tersedia.');
        }
    },
    
    async showAdminManageScripts(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_ADMIN_MANAGE_SCRIPTS', userId);
            
            if (ctx.from.id.toString() !== process.env.OWNER_ID) {
                await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
                return;
            }
            
            const menu = await menus.adminManageScripts();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showAdminManageScripts:', error);
            await ctx.reply('📦 Tidak ada script tersedia.');
        }
    },
    
    async showAdminAddStock(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_ADMIN_ADD_STOCK', userId);
            
            if (ctx.from.id.toString() !== process.env.OWNER_ID) {
                await ctx.answerCbQuery('❌ Akses ditolak! Hanya owner.', { show_alert: true });
                return;
            }
            
            await ctx.reply(
                '📈 TAMBAH STOK SCRIPT\n\n' +
                'Fitur ini telah dipindah ke menu utama admin.\n' +
                'Silakan klik tombol "📈 Tambah Stok Script" di Admin Panel.',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '👑 Admin Panel', callback_data: 'nav_admin' }],
                            [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('❌ Error in showAdminAddStock:', error);
            await ctx.reply('❌ Error loading add stock menu.');
        }
    },
    
    async showAdminManageUsers(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_ADMIN_MANAGE_USERS', userId);
            
            if (ctx.from.id.toString() !== process.env.OWNER_ID) {
                await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
                return;
            }
            
            const menu = await menus.adminManageUsers();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showAdminManageUsers:', error);
            await ctx.reply('👥 Error loading user data.');
        }
    },
    
    async showAdminStats(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_ADMIN_STATS', userId);
            
            if (ctx.from.id.toString() !== process.env.OWNER_ID) {
                await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
                return;
            }
            
            const menu = await menus.adminStats();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showAdminStats:', error);
            await ctx.reply('📊 Error loading statistics.');
        }
    },
    
    async showAdminUserDetails(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_ADMIN_USER_DETAILS', userId);
            
            if (ctx.from.id.toString() !== process.env.OWNER_ID) {
                await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
                return;
            }
            
            const menu = await menus.adminUserDetails();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showAdminUserDetails:', error);
            await ctx.reply('👥 Error loading user details.');
        }
    },
    
    async showAdminSettings(ctx) {
        try {
            const userId = ctx.from.id;
            logAction('SHOW_ADMIN_SETTINGS', userId);
            
            if (ctx.from.id.toString() !== process.env.OWNER_ID) {
                await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
                return;
            }
            
            const menu = await menus.adminSettings();
            return await this.sendMenu(ctx, menu);
        } catch (error) {
            console.error('❌ Error in showAdminSettings:', error);
            await ctx.reply('⚙️ Error loading settings.');
        }
    },
    
    async sendMenu(ctx, menu) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery().catch(() => {});
            }
            
            if (menu.type === 'photo') {
                if (ctx.callbackQuery) {
                    try {
                        await ctx.editMessageMedia({
                            type: 'photo',
                            media: menu.media,
                            caption: menu.caption,
                            parse_mode: undefined
                        }, { reply_markup: menu.reply_markup });
                    } catch (editError) {
                        await ctx.replyWithPhoto(menu.media, {
                            caption: menu.caption,
                            reply_markup: menu.reply_markup
                        });
                    }
                } else {
                    await ctx.replyWithPhoto(menu.media, {
                        caption: menu.caption,
                        reply_markup: menu.reply_markup
                    });
                }
            } else {
                if (ctx.callbackQuery) {
                    try {
                        await ctx.editMessageText(menu.text, {
                            parse_mode: undefined,
                            reply_markup: menu.reply_markup
                        });
                    } catch (editError) {
                        await ctx.reply(menu.text, {
                            reply_markup: menu.reply_markup
                        });
                    }
                } else {
                    await ctx.reply(menu.text, {
                        reply_markup: menu.reply_markup
                    });
                }
            }
        } catch (error) {
            console.error('Error in sendMenu:', error.message);
            if (menu.type === 'photo') {
                await ctx.replyWithPhoto(menu.media, {
                    caption: menu.caption.substring(0, 1024),
                    reply_markup: menu.reply_markup
                }).catch(async () => {
                    await ctx.reply(menu.caption.substring(0, 4096), {
                        reply_markup: menu.reply_markup
                    });
                });
            } else {
                await ctx.reply(menu.text.substring(0, 4096), {
                    reply_markup: menu.reply_markup
                });
            }
        }
    },
    
    async sendSimpleMenu(ctx, text, buttons) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery().catch(() => {});
                try {
                    await ctx.editMessageText(text, {
                        reply_markup: { inline_keyboard: buttons }
                    });
                } catch {
                    await ctx.reply(text, {
                        reply_markup: { inline_keyboard: buttons }
                    });
                }
            } else {
                await ctx.reply(text, {
                    reply_markup: { inline_keyboard: buttons }
                });
            }
        } catch (error) {
            console.error('Error in sendSimpleMenu:', error);
            await ctx.reply(text);
        }
    },
    
    async handlePurchase(ctx, productId) {
        try {
            const userId = ctx.from.id;
            logAction('HANDLE_PURCHASE', userId, { productId });
            
            const purchaseResult = await db.purchaseProduct(userId, productId);
            
            if (purchaseResult === null) {
                await ctx.answerCbQuery('❌ Produk tidak ditemukan atau sudah terjual!', { show_alert: true });
                return;
            }
            
            if (purchaseResult === false) {
                await ctx.answerCbQuery('❌ Saldo tidak cukup! Silakan topup dulu.', { show_alert: true });
                return;
            }
            
            const { user, product } = purchaseResult;
            
            console.log(`✅ Purchase successful: user ${userId} bought product ${product.id}`);
            
            await ctx.reply(
                `✅ PEMBELIAN BERHASIL!\n\n` +
                `🎮 Produk: ${product.name}\n` +
                `💰 Harga: ${this.formatRp(product.price)}\n` +
                `👤 Pembeli: ${user.first_name}\n` +
                `📅 Waktu: ${new Date().toLocaleString('id-ID')}\n\n` +
                `🔐 DETAIL AKUN:\n` +
                `📧 Email: ${product.email}\n` +
                `🔑 Password: ${product.password}\n` +
                `🌐 Login via: ${product.login_method}\n\n` +
                `⚠️ Simpan informasi ini dengan baik!\n` +
                `📞 Hubungi admin jika ada masalah.`
            );
            
            await this.showMainMenu(ctx);
            
        } catch (error) {
            console.error('❌ Error in handlePurchase:', error);
            await ctx.answerCbQuery('❌ Error processing purchase.', { show_alert: true });
        }
    },
    
    async handleScriptPurchase(ctx, scriptId) {
        try {
            const userId = ctx.from.id;
            logAction('HANDLE_SCRIPT_PURCHASE', userId, { scriptId });
            
            const purchaseResult = await db.purchaseScript(userId, scriptId);
            
            if (purchaseResult === null) {
                await ctx.answerCbQuery('❌ Script tidak ditemukan atau sudah terjual!', { show_alert: true });
                return;
            }
            
            if (purchaseResult === false) {
                await ctx.answerCbQuery('❌ Saldo tidak cukup! Silakan topup dulu.', { show_alert: true });
                return;
            }
            
            const { user, script } = purchaseResult;
            
            if (!script.file_id || script.file_id.trim() === '') {
                console.error('❌ script.file_id is empty! Script:', script);
                await ctx.reply(
                    `✅ PEMBELIAN SCRIPT BERHASIL!\n\n` +
                    `📦 Script: ${script.name}\n` +
                    `💰 Harga: ${this.formatRp(script.price)}\n` +
                    `👤 Pembeli: ${user.first_name}\n\n` +
                    `❌ FILE BELUM TERSEDIA\n\n` +
                    `Mohon hubungi admin untuk mendapatkan file script.\n` +
                    `Admin akan mengirim file secara manual.`
                );
                await this.showMainMenu(ctx);
                return;
            }
            
            try {
                await ctx.replyWithDocument(script.file_id, {
                    caption: `📦 ${script.name}\n` +
                            `📁 ${script.file_name} (${Math.round(script.file_size / 1024)} KB)\n` +
                            `📝 ${script.description.substring(0, 100)}...`
                });
                
                console.log(`✅ Script file sent to user ${userId}`);
                
                await ctx.reply(
                    `✅ PEMBELIAN SCRIPT BERHASIL!\n\n` +
                    `📦 Script: ${script.name}\n` +
                    `💰 Harga: ${this.formatRp(script.price)}\n` +
                    `👤 Pembeli: ${user.first_name}\n` +
                    `📅 Waktu: ${new Date().toLocaleString('id-ID')}\n\n` +
                    `📝 DESKRIPSI:\n${script.description}\n\n` +
                    `🔧 FITUR:\n${script.features}\n\n` +
                    `📁 File telah dikirim di atas ⬆️\n\n` +
                    `⚠️ PERHATIAN:\n` +
                    `• File hanya untuk penggunaan pribadi\n` +
                    `• Dilarang menyebarluaskan\n` +
                    `• Hubungi admin jika ada masalah`
                );
                
            } catch (fileError) {
                console.error('Error sending file:', fileError);
                await ctx.reply(
                    `✅ PEMBELIAN SCRIPT BERHASIL!\n\n` +
                    `📦 Script: ${script.name}\n` +
                    `💰 Harga: ${this.formatRp(script.price)}\n` +
                    `👤 Pembeli: ${user.first_name}\n` +
                    `📅 Waktu: ${new Date().toLocaleString('id-ID')}\n\n` +
                    `❌ GAGAL MENGIRIM FILE\n\n` +
                    `Silakan hubungi admin untuk mendapatkan file script.\n` +
                    `Error: ${fileError.message}`
                );
            }
            
            await this.showMainMenu(ctx);
            
        } catch (error) {
            console.error('❌ Error in handleScriptPurchase:', error);
            await ctx.answerCbQuery('❌ Error processing script purchase.', { show_alert: true });
        }
    },
    
    async sendAutoCheckStarted(ctx, depositId, amount) {
        try {
            await ctx.reply(
                `🚀 AUTO-CHECK DIMULAI!\n\n` +
                `💰 Nominal: ${this.formatRp(amount)}\n` +
                `🆔 Deposit ID: ${depositId}\n\n` +
                `Sistem akan otomatis mengecek pembayaran Anda setiap 3 detik.\n` +
                `✅ Saldo otomatis bertambah jika pembayaran berhasil.\n\n` +
                `⏳ Auto-check berjalan selama 5 menit.\n` +
                `📱 Silakan scan QR dan bayar sekarang!`
            );
        } catch (error) {
            console.error('Error sending auto-check started notification:', error);
        }
    },
    
    async sendAutoCheckSuccess(ctx, amount, depositId) {
        try {
            await ctx.reply(
                `✅ PEMBAYARAN DITERIMA OTOMATIS!\n\n` +
                `💰 Nominal: ${this.formatRp(amount)}\n` +
                `🎉 Saldo telah ditambahkan: ${this.formatRp(amount)}\n` +
                `📅 Waktu: ${new Date().toLocaleString('id-ID')}\n\n` +
                `🔍 Sistem otomatis mendeteksi pembayaran Anda.\n` +
                `🎮 Selamat berbelanja di Ultimate Game Store!`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🏠 Beranda', callback_data: 'nav_home' }],
                            [{ text: '🛒 Belanja Sekarang', callback_data: 'nav_shop' }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error sending auto-check success notification:', error);
        }
    }
};

module.exports = handlers;