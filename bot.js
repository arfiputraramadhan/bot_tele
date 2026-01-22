require('dotenv').config();
const { Telegraf } = require('telegraf');
const { initializeDB, db } = require('./database'); 
const handlers = require('./handlers');
const AtlanticService = require('./atlantic');

const bot = new Telegraf(process.env.BOT_TOKEN, {
    telegram: {
        apiRoot: 'https://api.telegram.org',
        timeout: 30000,
    },
    handlerTimeout: 60000
});

const userStates = new Map();
const qrisMessages = new Map();
const activeAutoChecks = new Map();

// Fungsi logging detail
const logAction = (action, userId, details = {}) => {
    const timestamp = new Date().toLocaleString('id-ID');
    console.log(`\n📋 [${timestamp}] ACTION LOG`);
    console.log(`👤 User: ${userId}`);
    console.log(`🎯 Action: ${action}`);
    console.log(`📊 Details:`, details);
    console.log(`─`.repeat(50));
};

// Fungsi formatRp
function formatRp(n) {
    try {
        const num = Number(n) || 0;
        return `Rp${num.toLocaleString('id-ID')}`;
    } catch {
        return `Rp${n || 0}`;
    }
}

// Auto-check system
async function startAutoCheckSystem() {
    console.log('🔄 Starting auto-check system for Atlantic deposits...');
    
    setInterval(async () => {
        try {
            const settings = await db.getSettings();
            if (!settings.auto_check_enabled) {
                return;
            }
            
            const pendingDeposits = await db.getPendingAtlanticDeposits();
            
            if (pendingDeposits.length === 0) {
                return;
            }
            
            console.log(`🔍 Auto-checking ${pendingDeposits.length} pending deposits...`);
            
            for (const deposit of pendingDeposits) {
                if (deposit.auto_check_count >= settings.auto_check_max_tries) {
                    console.log(`⚠️ Deposit ${deposit.id} exceeded max auto-check tries`);
                    
                    await db.updateAtlanticDeposit(deposit.id, {
                        status: 'expired',
                        processed_at: new Date()
                    });
                    
                    await deleteQRISMessages(deposit.user_id, deposit.id, false);
                    continue;
                }
                
                if (activeAutoChecks.has(deposit.id)) {
                    continue;
                }
                
                try {
                    console.log(`🔄 Auto-checking deposit ${deposit.id} (try ${deposit.auto_check_count + 1})`);
                    
                    const instantResult = await AtlanticService.checkInstantDeposit(deposit.atlantic_id, false);
                    
                    if (instantResult.success) {
                        console.log(`📊 Deposit ${deposit.id} instant status:`, instantResult.data.status);
                        
                        const updateResult = await db.checkAndUpdateAtlanticDeposit(deposit.id, instantResult);
                        
                        if (updateResult.success && updateResult.status === 'approved') {
                            console.log(`✅ Deposit ${deposit.id} auto-approved via instant check`);
                            
                            try {
                                await bot.telegram.sendMessage(
                                    deposit.user_id,
                                    `✅ PEMBAYARAN DITERIMA OTOMATIS!\n\n` +
                                    `💰 Nominal: ${formatRp(deposit.amount)}\n` +
                                    `🎉 Saldo telah ditambahkan: ${formatRp(deposit.amount)}\n` +
                                    `📅 Waktu: ${new Date().toLocaleString('id-ID')}\n\n` +
                                    `🔍 Sistem otomatis mendeteksi pembayaran Anda.\n` +
                                    `🎮 Selamat berbelanja!`,
                                    {
                                        reply_markup: {
                                            inline_keyboard: [
                                                [{ text: '🏠 Beranda', callback_data: 'nav_home' }],
                                                [{ text: '🛒 Belanja Sekarang', callback_data: 'nav_shop' }]
                                            ]
                                        }
                                    }
                                );
                                
                                await deleteQRISMessages(deposit.user_id, deposit.id, true);
                                
                            } catch (notifyError) {
                                console.error(`❌ Failed to notify user ${deposit.user_id}:`, notifyError.message);
                            }
                        }
                    } else {
                        console.log(`⚠️ Instant check failed for deposit ${deposit.id}:`, instantResult.message);
                    }
                    
                    await db.updateAtlanticDepositAutoCheck(deposit.id);
                    
                } catch (error) {
                    console.error(`❌ Auto-check error for deposit ${deposit.id}:`, error.message);
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
        } catch (error) {
            console.error('❌ Auto-check system error:', error.message);
        }
    }, 5000);
}

async function startManualCheckForDeposit(userId, depositId) {
    try {
        const deposit = await db.getPendingDepositByDepositId(depositId);
        if (!deposit) return;
        
        console.log(`🔍 Starting manual auto-check for deposit ${depositId}`);
        
        const checkInterval = setInterval(async () => {
            try {
                const currentDeposit = await db.getPendingDepositByDepositId(depositId);
                if (!currentDeposit || currentDeposit.status !== 'pending') {
                    clearInterval(checkInterval);
                    activeAutoChecks.delete(depositId);
                    return;
                }
                
                const instantResult = await AtlanticService.checkInstantDeposit(currentDeposit.atlantic_id, true);
                
                if (instantResult.success) {
                    console.log(`📊 Manual check deposit ${depositId}:`, instantResult.data.status);
                    
                    const updateResult = await db.checkAndUpdateAtlanticDeposit(depositId, instantResult);
                    
                    if (updateResult.success && updateResult.status === 'approved') {
                        console.log(`✅ Deposit ${depositId} approved via manual check`);
                        clearInterval(checkInterval);
                        activeAutoChecks.delete(depositId);
                        
                        try {
                            await bot.telegram.sendMessage(
                                userId,
                                `✅ PEMBAYARAN DITERIMA!\n\n` +
                                `💰 Nominal: ${formatRp(deposit.amount)}\n` +
                                `🎉 Saldo telah ditambahkan: ${formatRp(deposit.amount)}\n` +
                                `📅 Waktu: ${new Date().toLocaleString('id-ID')}\n\n` +
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
                            
                            await deleteQRISMessages(userId, depositId, true);
                            
                        } catch (notifyError) {
                            console.error(`❌ Failed to notify user ${userId}:`, notifyError.message);
                        }
                    }
                }
                
            } catch (error) {
                console.error(`❌ Manual check error for deposit ${depositId}:`, error.message);
            }
        }, 3000);
        
        activeAutoChecks.set(depositId, checkInterval);
        
        setTimeout(() => {
            if (activeAutoChecks.has(depositId)) {
                clearInterval(checkInterval);
                activeAutoChecks.delete(depositId);
                console.log(`⏹️ Stopped manual check for deposit ${depositId} (timeout)`);
            }
        }, 5 * 60 * 1000);
        
    } catch (error) {
        console.error('❌ Error starting manual check:', error.message);
    }
}

async function saveProductToDatabase(ctx, userId, state) {
    try {
        logAction('SAVE_PRODUCT', userId, {
            name: state.name,
            price: state.price,
            hasPhoto: !!state.photo_id
        });
        
        const productData = {
            name: state.name,
            price: state.price,
            login_method: state.loginMethod,
            email: state.email,
            password: state.password,
            description: state.description || '',
            photo_id: state.photo_id || null
        };
        
        const product = await db.addProduct(productData);
        
        console.log(`✅ Product saved successfully:`, {
            productId: product.id,
            name: product.name,
            status: product.status
        });
        
        userStates.delete(userId);
        
        let photoInfo = '';
        if (state.photo_id) {
            photoInfo = '📸 Dengan foto produk\n';
        } else {
            photoInfo = '📭 Tanpa foto produk\n';
        }
        
        await ctx.reply(
            `✅ PRODUK BERHASIL DITAMBAHKAN!\n\n` +
            `📛 Nama: ${state.name}\n` +
            `💰 Harga: ${formatRp(state.price)}\n` +
            `🔐 Login Method: ${state.loginMethod}\n` +
            `📧 Email: ${state.email}\n` +
            `🔑 Password: ${state.password}\n` +
            `${photoInfo}` +
            `📝 Deskripsi: ${(state.description || 'Tidak ada').substring(0, 100)}...\n` +
            `📊 Status: ✅ TERSEDIA\n\n` +
            `Produk sekarang tersedia di etalase game!`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛒 Lihat di Etalase', callback_data: 'nav_shop' }],
                        [{ text: '➕ Tambah Produk Lagi', callback_data: 'admin_add_product' }],
                        [{ text: '👑 Admin Panel', callback_data: 'nav_admin' }]
                    ]
                }
            }
        );
        
        console.log(`🎉 Product addition completed for user ${userId}`);
        
    } catch (error) {
        console.error('❌ Error saving product:', error);
        userStates.delete(userId);
        
        await ctx.reply(
            '❌ GAGAL MENYIMPAN PRODUK!\n\n' +
            'Terjadi kesalahan saat menyimpan produk.\n' +
            'Silakan coba lagi atau hubungi developer.\n\n' +
            `Error: ${error.message}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '👑 Admin Panel', callback_data: 'nav_admin' }],
                        [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                    ]
                }
            }
        );
    }
}

async function startBot() {
    console.log('🚀 Ultimate Game Store Bot - ATLANTIC QRIS VERSION');
    console.log('📅', new Date().toLocaleString('id-ID'));
    console.log('👤 Owner ID:', process.env.OWNER_ID || 'Not set');
    
    try {
        await initializeDB();
        console.log('💾 Database initialized');
        
        console.log('\n🔐 Atlantic API Diagnostics:');
        console.log('='.repeat(50));
        
        const apiKey = process.env.ATLANTIC_API_KEY;
        if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
            console.log('❌ ATLANTIC_API_KEY belum diatur di .env!');
            console.log('💡 Tambahkan API Key Atlantic Anda di file .env');
            console.log('ATLANTIC_API_KEY=your_atlantic_api_key_here');
        } else {
            console.log('🔑 API Key:', apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4));
            console.log('🌐 API URL:', process.env.ATLANTIC_API_URL);
            
            const testResult = await AtlanticService.testConnection();
            console.log(testResult.message);
        }
        
        console.log('='.repeat(50));
        
        const botInfo = await bot.telegram.getMe();
        console.log('🤖 Bot:', botInfo.username, `(ID: ${botInfo.id})`);
        console.log('✅ Bot connected!');
        
        await bot.telegram.setMyCommands([
            { command: 'start', description: 'Mulai bot & menu utama' },
            { command: 'help', description: 'Bantuan & panduan' },
            { command: 'saldo', description: 'Cek saldo Anda' },
            { command: 'topup', description: 'Topup saldo via QRIS' },
            { command: 'scripts', description: 'Lihat script bot tersedia' },
            { command: 'admin', description: 'Admin panel (owner only)' }
        ]);
        
        await startAutoCheckSystem();
        console.log('🔄 Auto-check system started');
        
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'callback_query', 'document', 'photo']
        });
        
        console.log('🎉 Bot is now running!');
        console.log('📝 Use Ctrl+C to stop');
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        process.exit(1);
    }
}

async function deleteQRISMessages(userId, depositId, success = true) {
    try {
        const messages = qrisMessages.get(userId) || [];
        const depositMessages = messages.filter(m => m.depositId === depositId);
        
        console.log(`🗑️ Deleting ${depositMessages.length} QRIS messages for deposit ${depositId}`);
        
        for (const msg of depositMessages) {
            try {
                await bot.telegram.deleteMessage(msg.chatId, msg.messageId);
                console.log(`✅ Deleted message ${msg.messageId} in chat ${msg.chatId}`);
            } catch (deleteError) {
                if (!deleteError.description.includes('message to delete not found')) {
                    console.warn(`⚠️ Error deleting message ${msg.messageId}:`, deleteError.message);
                }
            }
        }
        
        const updatedMessages = messages.filter(m => m.depositId !== depositId);
        if (updatedMessages.length > 0) {
            qrisMessages.set(userId, updatedMessages);
        } else {
            qrisMessages.delete(userId);
        }
        
        if (activeAutoChecks.has(depositId)) {
            clearInterval(activeAutoChecks.get(depositId));
            activeAutoChecks.delete(depositId);
            console.log(`⏹️ Stopped manual check for deposit ${depositId}`);
        }
        
        return depositMessages.length;
        
    } catch (error) {
        console.error('❌ Error in deleteQRISMessages:', error.message);
        return 0;
    }
}

function storeQRISMessage(userId, depositId, chatId, messageId) {
    try {
        const messages = qrisMessages.get(userId) || [];
        messages.push({ depositId, chatId, messageId, timestamp: Date.now() });
        qrisMessages.set(userId, messages);
        console.log(`📝 Stored QRIS message: user ${userId}, deposit ${depositId}, message ${messageId}`);
    } catch (error) {
        console.error('Error storing QRIS message:', error.message);
    }
}

async function deleteQRISMessagesWithDelay(userId, depositId, success, delay = 2000) {
    setTimeout(async () => {
        const deletedCount = await deleteQRISMessages(userId, depositId, success);
        console.log(`✅ Auto-deleted ${deletedCount} messages for deposit ${depositId}`);
    }, delay);
}

bot.start(async (ctx) => {
    logAction('START_COMMAND', ctx.from.id, {
        username: ctx.from.username,
        firstName: ctx.from.first_name
    });
    
    const settings = await db.getSettings();
    if (settings.maintenance && ctx.from.id.toString() !== process.env.OWNER_ID) {
        return ctx.reply('🔧 BOT SEDANG DALAM PERBAIKAN\n\nMohon maaf, bot sedang dalam maintenance. Silakan coba lagi nanti.');
    }
    await handlers.showMainMenu(ctx);
});

bot.help(async (ctx) => {
    logAction('HELP_COMMAND', ctx.from.id);
    await ctx.reply(
        '🆘 BANTUAN\n\n' +
        'Perintah yang tersedia:\n' +
        '/start - Mulai bot\n' +
        '/saldo - Cek saldo\n' +
        '/topup - Topup saldo via QRIS\n' +
        '/scripts - Lihat script bot\n' +
        '/admin - Admin panel (owner)\n\n' +
        'Gunakan tombol menu untuk navigasi.'
    );
});

bot.command('saldo', async (ctx) => {
    logAction('SALDO_COMMAND', ctx.from.id);
    const user = await db.getUser(ctx.from.id, ctx.from);
    await ctx.reply(
        `💰 SALDO ANDA\n\n` +
        `Saldo: ${formatRp(user.balance)}\n` +
        `Level: ${user.level}`
    );
});

bot.command('topup', async (ctx) => {
    logAction('TOPUP_COMMAND', ctx.from.id);
    await handlers.showDepositMenu(ctx);
});

bot.command('scripts', async (ctx) => {
    logAction('SCRIPTS_COMMAND', ctx.from.id);
    await handlers.showScriptsMenu(ctx, 0);
});

bot.command('admin', async (ctx) => {
    logAction('ADMIN_COMMAND', ctx.from.id);
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        return ctx.reply('❌ Akses ditolak!');
    }
    await handlers.showAdminPanel(ctx);
});

// Actions
bot.action(/^buy_script_(.+)$/, async (ctx) => {
    const scriptId = ctx.match[1];
    logAction('BUY_SCRIPT', ctx.from.id, { scriptId });
    await handlers.handleScriptPurchase(ctx, scriptId);
});

bot.action('nav_home', async (ctx) => {
    logAction('NAV_HOME', ctx.from.id);
    await handlers.showMainMenu(ctx);
});

bot.action('nav_shop', async (ctx) => {
    logAction('NAV_SHOP', ctx.from.id);
    await handlers.showShop(ctx, 0);
});

bot.action('nav_scripts', async (ctx) => {
    logAction('NAV_SCRIPTS', ctx.from.id);
    await handlers.showScriptsMenu(ctx, 0);
});

bot.action('nav_admin', async (ctx) => {
    logAction('NAV_ADMIN', ctx.from.id);
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        await ctx.answerCbQuery('❌ Akses ditolak! Hanya owner.', { show_alert: true });
        return;
    }
    await handlers.showAdminPanel(ctx);
});

bot.action('nav_deposit', async (ctx) => {
    logAction('NAV_DEPOSIT', ctx.from.id);
    await handlers.showDepositMenu(ctx);
});

bot.action('nav_profile', async (ctx) => {
    logAction('NAV_PROFILE', ctx.from.id);
    await handlers.showProfile(ctx);
});

bot.action('nav_info', async (ctx) => {
    logAction('NAV_INFO', ctx.from.id);
    await handlers.showInfoMenu(ctx);
});

bot.action('profile_history', async (ctx) => {
    logAction('PROFILE_HISTORY', ctx.from.id);
    await handlers.showPurchaseHistory(ctx);
});

bot.action('profile_settings', async (ctx) => {
    logAction('PROFILE_SETTINGS', ctx.from.id);
    await handlers.showProfileSettings(ctx);
});

bot.action('profile_update', async (ctx) => {
    logAction('PROFILE_UPDATE', ctx.from.id);
    await handlers.showProfileUpdate(ctx);
});

bot.action('deposit_method_qris', async (ctx) => {
    logAction('DEPOSIT_QRIS', ctx.from.id);
    try {
        const isValid = await AtlanticService.validateApiKey();
        if (!isValid) {
            await ctx.answerCbQuery('❌ Sistem pembayaran sedang maintenance. Silakan coba lagi nanti.', { show_alert: true });
            return;
        }
        
        userStates.set(ctx.from.id, { 
            action: 'DEPOSIT_AMOUNT_ATLANTIC', 
            method: 'QRIS_ATLANTIC',
            step: 'amount'
        });
        
        const settings = await db.getSettings();
        await ctx.reply(
            '💳 DEPOSIT VIA QRIS (ATLANTIC)\n\n' +
            'Masukkan nominal deposit (angka saja):\n\n' +
            `💰 Minimal: ${formatRp(settings.min_deposit)}\n` +
            `💵 Maksimal: ${formatRp(settings.max_deposit)}\n\n` +
            '⚠️ Sistem akan otomatis verifikasi pembayaran\n' +
            '📱 Scan QR untuk bayar, saldo otomatis masuk\n\n' +
            'Contoh: 10000\n\n' +
            'Ketik "cancel" untuk membatalkan'
        );
    } catch (error) {
        console.error('Atlantic validation error:', error);
        await ctx.answerCbQuery('❌ Sistem QRIS sedang gangguan. Silakan coba lagi nanti.', { show_alert: true });
    }
});

bot.action('deposit_guide', async (ctx) => {
    logAction('DEPOSIT_GUIDE', ctx.from.id);
    await handlers.showDepositGuide(ctx);
});

bot.action('deposit_cancel', async (ctx) => {
    logAction('DEPOSIT_CANCEL', ctx.from.id);
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    
    if (state?.depositId) {
        await deleteQRISMessages(userId, state.depositId, false);
    }
    
    userStates.delete(userId);
    await ctx.reply(
        '❌ DEPOSIT DIBATALKAN\n\n' +
        'Anda telah membatalkan proses deposit.\n' +
        'Kembali ke menu utama untuk memulai ulang.',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                ]
            }
        }
    );
});

bot.action('admin_add_product', async (ctx) => {
    logAction('ADMIN_ADD_PRODUCT', ctx.from.id);
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
        return;
    }
    
    userStates.set(ctx.from.id, { 
        action: 'ADMIN_ADD_PRODUCT',
        step: 1 
    });
    
    await ctx.reply(
        '➕ TAMBAH PRODUK BARU\n\n' +
        'Masukkan nama produk:\n\n' +
        'Contoh: "Game XYZ Premium Account"\n\n' +
        'Ketik "cancel" untuk membatalkan'
    );
});

bot.action('admin_add_script', async (ctx) => {
    logAction('ADMIN_ADD_SCRIPT', ctx.from.id);
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
        return;
    }
    
    userStates.set(ctx.from.id, { 
        action: 'ADMIN_ADD_SCRIPT',
        step: 1 
    });
    
    await ctx.reply(
        '📦 TAMBAH SCRIPT BOT\n\n' +
        'Masukkan nama script bot:\n\n' +
        'Contoh: "Auto Claim Bot", "Mining Bot", "Trading Bot"\n\n' +
        'Ketik "cancel" untuk membatalkan'
    );
});

bot.action('admin_add_stock', async (ctx) => {
    logAction('ADMIN_ADD_STOCK', ctx.from.id);
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        await ctx.answerCbQuery('❌ Akses ditolak! Hanya owner.', { show_alert: true });
        return;
    }
    
    userStates.set(ctx.from.id, { 
        action: 'ADMIN_ADD_STOCK',
        step: 1 
    });
    
    await ctx.reply(
        '📈 TAMBAH STOK SCRIPT\n\n' +
        'Masukkan ID script (format: Sxxxxxxxxx):\n\n' +
        'Contoh: S1767057123264\n\n' +
        'Ketik "cancel" untuk membatalkan'
    );
});

bot.action('admin_manage_products', async (ctx) => {
    logAction('ADMIN_MANAGE_PRODUCTS', ctx.from.id);
    await handlers.showAdminManageProducts(ctx);
});

bot.action('admin_manage_scripts', async (ctx) => {
    logAction('ADMIN_MANAGE_SCRIPTS', ctx.from.id);
    await handlers.showAdminManageScripts(ctx);
});

bot.action('admin_manage_users', async (ctx) => {
    logAction('ADMIN_MANAGE_USERS', ctx.from.id);
    await handlers.showAdminManageUsers(ctx);
});

bot.action('admin_stats', async (ctx) => {
    logAction('ADMIN_STATS', ctx.from.id);
    await handlers.showAdminStats(ctx);
});

bot.action('admin_user_details', async (ctx) => {
    logAction('ADMIN_USER_DETAILS', ctx.from.id);
    await handlers.showAdminUserDetails(ctx);
});

bot.action(/^delete_product_(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    logAction('DELETE_PRODUCT', ctx.from.id, { productId });
    
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        await ctx.answerCbQuery('❌ Akses ditolak! Hanya owner.', { show_alert: true });
        return;
    }
    
    try {
        const product = await db.getProduct(productId);
        
        if (!product) {
            await ctx.answerCbQuery('❌ Produk tidak ditemukan.', { show_alert: true });
            return;
        }
        
        const success = await db.deleteProduct(productId);
        
        if (success) {
            await ctx.answerCbQuery('✅ Produk berhasil dihapus!', { show_alert: true });
            
            try {
                await ctx.editMessageText(
                    `🗑️ PRODUK DIHAPUS\n\n` +
                    `✅ "${product.name}" berhasil dihapus dari database.\n\n` +
                    `Harga: ${formatRp(product.price)}\n` +
                    `Status: ❌ DIHAPUS PERMANEN\n\n` +
                    `⚠️ Produk tidak akan muncul lagi di etalase.`,
                    { 
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "📦 Kelola Produk", callback_data: "admin_manage_products" },
                                { text: "🏠 Beranda", callback_data: "nav_home" }]
                            ]
                        }
                    }
                );
            } catch (editError) {
                await ctx.reply(
                    `✅ Produk "${product.name}" berhasil dihapus!`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: "📦 Kelola Produk", callback_data: "admin_manage_products" }
                            ]]
                        }
                    }
                );
            }
            
        } else {
            await ctx.answerCbQuery('❌ Gagal menghapus produk.', { show_alert: true });
        }
        
    } catch (error) {
        console.error('Error deleting product:', error);
        await ctx.answerCbQuery('❌ Error menghapus produk.', { show_alert: true });
    }
});

bot.action(/^delete_script_(.+)$/, async (ctx) => {
    const scriptId = ctx.match[1];
    logAction('DELETE_SCRIPT', ctx.from.id, { scriptId });
    
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        await ctx.answerCbQuery('❌ Akses ditolak! Hanya owner.', { show_alert: true });
        return;
    }
    
    try {
        const script = await db.getScript(scriptId);
        
        if (!script) {
            await ctx.answerCbQuery('❌ Script tidak ditemukan.', { show_alert: true });
            return;
        }
        
        const success = await db.deleteScript(scriptId);
        
        if (success) {
            await ctx.answerCbQuery('✅ Script berhasil dihapus!', { show_alert: true });
            
            try {
                await ctx.editMessageText(
                    `🗑️ SCRIPT DIHAPUS\n\n` +
                    `✅ "${script.name}" berhasil dihapus dari database.\n\n` +
                    `Harga: ${formatRp(script.price)}\n` +
                    `Status: ❌ DIHAPUS PERMANEN\n\n` +
                    `⚠️ Script tidak akan muncul lagi di daftar.`,
                    { 
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "📦 Kelola Script", callback_data: "admin_manage_scripts" },
                                { text: "🏠 Beranda", callback_data: "nav_home" }]
                            ]
                        }
                    }
                );
            } catch (editError) {
                await ctx.reply(
                    `✅ Script "${script.name}" berhasil dihapus!`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: "📦 Kelola Script", callback_data: "admin_manage_scripts" }
                            ]]
                        }
                    }
                );
            }
            
        } else {
            await ctx.answerCbQuery('❌ Gagal menghapus script.', { show_alert: true });
        }
        
    } catch (error) {
        console.error('Error deleting script:', error);
        await ctx.answerCbQuery('❌ Error menghapus script.', { show_alert: true });
    }
});

bot.action('admin_settings', async (ctx) => {
    logAction('ADMIN_SETTINGS', ctx.from.id);
    await handlers.showAdminSettings(ctx);
});

bot.action('admin_broadcast', async (ctx) => {
    logAction('ADMIN_BROADCAST', ctx.from.id);
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
        return;
    }
    
    userStates.set(ctx.from.id, { action: 'BROADCAST_MESSAGE' });
    
    const users = await db.getUsers();
    
    await ctx.reply(
        `📢 BROADCAST PESAN\n\n` +
        `Masukkan pesan yang ingin dikirim ke semua user:\n\n` +
        `⚠️ PERHATIAN:\n` +
        `• Pesan akan dikirim ke ${users.length} user\n` +
        `• Proses mungkin memakan waktu\n\n` +
        `Ketik "cancel" untuk membatalkan`
    );
});

bot.action(/^page_(-?\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    logAction('PAGE_NAVIGATION', ctx.from.id, { page });
    await handlers.showShop(ctx, page);
});

bot.action(/^script_page_(-?\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    logAction('SCRIPT_PAGE_NAVIGATION', ctx.from.id, { page });
    await handlers.showScriptsMenu(ctx, page);
});

bot.action(/^buy_(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    logAction('BUY_PRODUCT', ctx.from.id, { productId });
    await handlers.handlePurchase(ctx, productId);
});

bot.action(/^check_atlantic_(.+)$/, async (ctx) => {
    const depositId = ctx.match[1];
    const userId = ctx.from.id;
    logAction('CHECK_ATLANTIC', userId, { depositId });
    
    try {
        await ctx.answerCbQuery('🔄 Mengecek status pembayaran...');
        
        const deposit = await db.getPendingDepositByDepositId(depositId);
        if (!deposit || deposit.method !== 'QRIS_ATLANTIC') {
            await ctx.reply('❌ Deposit tidak ditemukan.');
            return;
        }
        
        if (!deposit.atlantic_id) {
            await ctx.reply('❌ Deposit tidak memiliki ID Atlantic.');
            return;
        }
        
        const instantResult = await AtlanticService.checkInstantDeposit(deposit.atlantic_id, true);
        
        if (!instantResult.success) {
            await ctx.reply(`❌ Gagal cek status: ${instantResult.message}`);
            return;
        }
        
        const updateResult = await db.checkAndUpdateAtlanticDeposit(depositId, instantResult);
        
        if (updateResult.success) {
            if (updateResult.status === 'approved') {
                await deleteQRISMessagesWithDelay(userId, depositId, true);
                
                await ctx.reply(
                    `✅ PEMBAYARAN BERHASIL!\n\n` +
                    `💰 Nominal: ${formatRp(deposit.amount)}\n` +
                    `🎉 Saldo Anda telah ditambahkan: ${formatRp(deposit.amount)}\n` +
                    `📅 Waktu: ${new Date().toLocaleString('id-ID')}\n\n` +
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
                
            } else if (updateResult.status === 'pending' || updateResult.status === 'process') {
                await ctx.reply(
                    `⏳ MENUNGGU PEMBAYARAN\n\n` +
                    `💰 Nominal: ${formatRp(deposit.amount)}\n` +
                    `🔄 Status: ${instantResult.data.status}\n` +
                    `💡 Sistem otomatis akan mengecek pembayaran Anda.\n\n` +
                    `Tunggu beberapa detik dan coba lagi.`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔄 Cek Lagi', callback_data: `check_atlantic_${depositId}` }],
                                [{ text: '🚀 Start Auto-Check', callback_data: `auto_check_atlantic_${depositId}` }],
                                [{ text: '❌ Batalkan', callback_data: `cancel_atlantic_${depositId}` }]
                            ]
                        }
                    }
                );
            } else if (updateResult.status === 'expired') {
                await deleteQRISMessagesWithDelay(userId, depositId, false);
                
                await ctx.reply(
                    `❌ QR CODE EXPIRED\n\n` +
                    `QR code telah kadaluarsa.\n` +
                    `Silakan buat deposit baru.`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💳 Deposit Baru', callback_data: 'nav_deposit' }],
                                [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                            ]
                        }
                    }
                );
            }
        } else {
            await ctx.reply(`❌ Gagal update status: ${updateResult.message}`);
        }
        
    } catch (error) {
        console.error('Error checking Atlantic status:', error);
        await ctx.reply('❌ Terjadi kesalahan saat mengecek status. Coba lagi nanti.');
    }
});

bot.action(/^auto_check_atlantic_(.+)$/, async (ctx) => {
    const depositId = ctx.match[1];
    const userId = ctx.from.id;
    logAction('AUTO_CHECK_ATLANTIC', userId, { depositId });
    
    try {
        await ctx.answerCbQuery('🚀 Memulai auto-check...');
        
        const deposit = await db.getPendingDepositByDepositId(depositId);
        if (!deposit) {
            await ctx.reply('❌ Deposit tidak ditemukan.');
            return;
        }
        
        await ctx.reply(
            `🚀 AUTO-CHECK DIAKTIFKAN!\n\n` +
            `Sistem akan otomatis mengecek pembayaran Anda setiap 3 detik.\n` +
            `💰 Nominal: ${formatRp(deposit.amount)}\n` +
            `🆔 Deposit ID: ${depositId}\n\n` +
            `📱 Silakan scan QR code dan bayar sekarang.\n` +
            `✅ Saldo akan otomatis masuk jika pembayaran berhasil.\n\n` +
            `⏳ Auto-check akan berjalan selama 5 menit.`
        );
        
        await startManualCheckForDeposit(userId, depositId);
        
    } catch (error) {
        console.error('Error starting auto-check:', error);
        await ctx.reply('❌ Gagal memulai auto-check. Coba lagi nanti.');
    }
});

bot.action(/^cancel_atlantic_(.+)$/, async (ctx) => {
    const depositId = ctx.match[1];
    const userId = ctx.from.id;
    logAction('CANCEL_ATLANTIC', userId, { depositId });
    
    try {
        await ctx.answerCbQuery('🔄 Membatalkan deposit...');
        
        const deposit = await db.getPendingDepositByDepositId(depositId);
        if (!deposit) {
            await ctx.reply('❌ Deposit tidak ditemukan.');
            return;
        }
        
        if (deposit.atlantic_id) {
            try {
                await AtlanticService.cancelDeposit(deposit.atlantic_id);
            } catch (cancelError) {
                console.warn('⚠️ Gagal cancel di Atlantic, tetap lanjutkan:', cancelError.message);
            }
        }
        
        await db.updateAtlanticDeposit(depositId, {
            status: 'rejected',
            processed_at: new Date()
        });
        
        await deleteQRISMessagesWithDelay(userId, depositId, false);
        
        await ctx.reply(
            '❌ DEPOSIT DIBATALKAN\n\n' +
            'Deposit QRIS Atlantic telah dibatalkan.\n' +
            'QR code telah dihapus dari chat.\n' +
            'Silakan buat deposit baru jika ingin melanjutkan.',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💳 Deposit Baru', callback_data: 'nav_deposit' }],
                        [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                    ]
                }
            }
        );
        
    } catch (error) {
        console.error('Error canceling Atlantic deposit:', error);
        await ctx.reply('❌ Gagal membatalkan deposit. Coba lagi nanti.');
    }
});

bot.action('settings_maintenance_on', async (ctx) => {
    logAction('MAINTENANCE_ON', ctx.from.id);
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
        return;
    }
    
    await db.updateSettings({ maintenance: true });
    await ctx.answerCbQuery('✅ Maintenance mode ON', { show_alert: true });
    await handlers.showAdminSettings(ctx);
});

bot.action('settings_maintenance_off', async (ctx) => {
    logAction('MAINTENANCE_OFF', ctx.from.id);
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        await ctx.answerCbQuery('❌ Akses ditolak!', { show_alert: true });
        return;
    }
    
    await db.updateSettings({ maintenance: false });
    await ctx.answerCbQuery('✅ Maintenance mode OFF', { show_alert: true });
    await handlers.showAdminSettings(ctx);
});

bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery();
});

bot.action('qris_guide', async (ctx) => {
    logAction('QRIS_GUIDE', ctx.from.id);
    await ctx.answerCbQuery();
    await ctx.reply(
        `*📋 PANDUAN SCAN QRIS*\n\n` +
        `1. 📱 Buka aplikasi e-wallet/banking\n` +
        `2. 🔍 Pilih "Scan QR"\n` +
        `3. 📷 Arahkan ke QR code\n` +
        `4. 💰 Bayar sesuai nominal\n` +
        `5. ✅ Klik "🔄 Cek Status"\n\n` +
        `*🔍 Tidak bisa scan?*\n` +
        `• Screenshot QR, scan dari galeri\n` +
        `• Pastikan kamera fokus\n` +
        `• Coba aplikasi berbeda (DANA/OVO)\n\n` +
        `*⏳ Proses lambat?*\n` +
        `• Tunggu 1-5 menit\n` +
        `• Cek status berkala\n` +
        `• Klik "🚀 Start Auto-Check" untuk auto-verifikasi\n` +
        `• Hubungi admin jika >10 menit`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Kembali ke Deposit', callback_data: 'nav_deposit' }],
                    [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                ]
            }
        }
    );
});

// Handler untuk teks
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const state = userStates.get(userId);
    
    logAction('TEXT_MESSAGE', userId, { 
        text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
        state: state?.action || 'none'
    });
    
    if (text.startsWith('/')) return;
    
    try {
        if (text.toLowerCase() === 'cancel') {
            if (state?.depositId) {
                await deleteQRISMessages(userId, state.depositId, false);
            }
            
            userStates.delete(userId);
            await ctx.reply(
                '❌ PROSES DIBATALKAN\n\n' +
                'Anda telah membatalkan proses.\n' +
                'Kembali ke menu utama untuk memulai ulang.',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                        ]
                    }
                }
            );
            return;
        }
        
        // Handle skip untuk foto produk
        if (state?.action === 'ADMIN_ADD_PRODUCT' && state.step === 7) {
            if (text.toLowerCase() === 'skip') {
                console.log(`📸 User ${userId} memilih skip foto produk`);
                state.photo_id = null;
                state.step = 'save';
                userStates.set(userId, state);
                
                await ctx.reply(
                    '📸 Foto produk dilewati.\n\n' +
                    '🔄 Menyimpan produk ke database...'
                );
                
                await saveProductToDatabase(ctx, userId, state);
                return;
            }
        }
        
        if (state?.action === 'DEPOSIT_AMOUNT_ATLANTIC' && state.step === 'amount') {
            const settings = await db.getSettings();
            const amount = parseInt(text.replace(/[^\d]/g, ''));
            
            if (isNaN(amount) || amount < settings.min_deposit || amount > settings.max_deposit) {
                await ctx.reply(
                    `❌ NOMINAL TIDAK VALID!\n\n` +
                    `Minimal: ${formatRp(settings.min_deposit)}\n` +
                    `Maksimal: ${formatRp(settings.max_deposit)}\n\n` +
                    `Silakan masukkan nominal yang valid.\n\n` +
                    `Ketik "cancel" untuk membatalkan`
                );
                return;
            }
            
            await ctx.reply(`🔄 Membuat QRIS payment untuk ${formatRp(amount)}, mohon tunggu...`);
            
            try {
                console.log('📤 Creating Atlantic deposit for user:', userId, 'amount:', amount);
                
                const atlanticResult = await AtlanticService.createQRISDeposit({
                    reff_id: `DEP${userId}${Date.now()}`,
                    nominal: amount
                });
                
                console.log('📥 Atlantic deposit result:', {
                    success: atlanticResult.success,
                    hasData: !!atlanticResult.data,
                    data: atlanticResult.data ? {
                        id: atlanticResult.data.id,
                        hasQRImage: !!atlanticResult.data.qr_image,
                        hasQRString: !!atlanticResult.data.qr_string,
                        status: atlanticResult.data.status
                    } : 'No data'
                });
                
                if (!atlanticResult.success) {
                    throw new Error(atlanticResult.message || 'Gagal membuat deposit Atlantic');
                }
                
                const deposit = await db.createAtlanticDeposit(userId, amount, atlanticResult.data);
                
                const chatId = ctx.chat.id;
                const currentMessageId = ctx.message.message_id;
                storeQRISMessage(userId, deposit.id, chatId, currentMessageId);
                
                const sentMessage = await handlers.showAtlanticQRIS(ctx, amount, deposit.id, atlanticResult.data);
                
                if (sentMessage && sentMessage.message_id) {
                    storeQRISMessage(userId, deposit.id, chatId, sentMessage.message_id);
                }
                
                if (sentMessage.all_message_ids) {
                    sentMessage.all_message_ids.forEach(msgId => {
                        storeQRISMessage(userId, deposit.id, chatId, msgId);
                    });
                }
                
                state.depositId = deposit.id;
                state.atlanticId = atlanticResult.data.id;
                userStates.set(userId, state);
                
                await startManualCheckForDeposit(userId, deposit.id);
                
            } catch (error) {
                console.error('❌ Atlantic deposit creation error:', error);
                await ctx.reply(
                    `❌ GAGAL MEMBUAT QRIS\n\n` +
                    `Error: ${error.message}\n\n` +
                    `Silakan coba lagi atau hubungi admin.`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💳 Coba Lagi', callback_data: 'deposit_method_qris' }],
                                [{ text: '👑 Hubungi Admin', url: 'https://t.me/sokkk91' }]
                            ]
                        }
                    }
                );
                userStates.delete(userId);
            }
            
            return;
        }
        
        if (state?.action === 'ADMIN_ADD_PRODUCT') {
            if (!state.step) state.step = 1;
            
            switch(state.step) {
                case 1:
                    console.log(`📝 User ${userId} memasukkan nama produk: ${text}`);
                    state.name = text;
                    state.step = 2;
                    userStates.set(userId, state);
                    
                    await ctx.reply(
                        '💰 HARGA PRODUK\n\n' +
                        'Masukkan harga produk (angka saja):\n\n' +
                        'Contoh: 150000\n\n' +
                        'Ketik "cancel" untuk membatalkan'
                    );
                    break;
                    
                case 2:
                    const price = parseInt(text.replace(/[^\d]/g, ''));
                    if (isNaN(price) || price < 1000) {
                        await ctx.reply(
                            '❌ Harga tidak valid!\n' +
                            'Masukkan angka yang valid (minimal 1000).\n\n' +
                            'Contoh: 150000\n\n' +
                            'Ketik "cancel" untuk membatalkan'
                        );
                        return;
                    }
                    
                    console.log(`💰 User ${userId} memasukkan harga produk: ${price}`);
                    state.price = price;
                    state.step = 3;
                    userStates.set(userId, state);
                    
                    await ctx.reply(
                        '🔐 LOGIN METHOD\n\n' +
                        'Masukkan cara login:\n\n' +
                        'Contoh: "Email & Password", "Google Play", "App Store", "Facebook"\n\n' +
                        'Ketik "cancel" untuk membatalkan'
                    );
                    break;
                    
                case 3:
                    console.log(`🔐 User ${userId} memasukkan login method: ${text}`);
                    state.loginMethod = text;
                    state.step = 4;
                    userStates.set(userId, state);
                    
                    await ctx.reply(
                        '📧 EMAIL AKUN\n\n' +
                        'Masukkan email akun:\n\n' +
                        'Contoh: "gameaccount@email.com"\n\n' +
                        'Ketik "cancel" untuk membatalkan'
                    );
                    break;
                    
                case 4:
                    console.log(`📧 User ${userId} memasukkan email: ${text}`);
                    state.email = text;
                    state.step = 5;
                    userStates.set(userId, state);
                    
                    await ctx.reply(
                        '🔑 PASSWORD AKUN\n\n' +
                        'Masukkan password akun:\n\n' +
                        'Ketik "cancel" untuk membatalkan'
                    );
                    break;
                    
                case 5:
                    console.log(`🔑 User ${userId} memasukkan password: [HIDDEN]`);
                    state.password = text;
                    state.step = 6;
                    userStates.set(userId, state);
                    
                    await ctx.reply(
                        '📝 DESKRIPSI PRODUK\n\n' +
                        'Masukkan deskripsi produk (opsional):\n\n' +
                        'Contoh: "Akun premium level 100, memiliki semua skin, bisa ganti email"\n\n' +
                        'Ketik "skip" untuk melewatkan\n' +
                        'Ketik "cancel" untuk membatalkan'
                    );
                    break;
                    
                case 6:
                    const description = text === 'skip' ? '' : text;
                    console.log(`📝 User ${userId} memasukkan deskripsi: ${description.substring(0, 50)}...`);
                    state.description = description;
                    state.step = 7;
                    userStates.set(userId, state);
                    
                    await ctx.reply(
                        '📸 FOTO PRODUK\n\n' +
                        'Kirim foto untuk produk ini:\n\n' +
                        'Note: Gunakan tombol kirim foto\n\n' +
                        'Ketik "skip" untuk tanpa foto\n' +
                        'Ketik "cancel" untuk membatalkan'
                    );
                    break;
            }
            return;
        }
        
        if (state?.action === 'ADMIN_ADD_SCRIPT') {
            if (!state.step) state.step = 1;
            
            switch(state.step) {
                case 1:
                    console.log(`📦 User ${userId} memasukkan nama script: ${text}`);
                    state.name = text;
                    state.step = 2;
                    userStates.set(userId, state);
                    
                    await ctx.reply(
                        '💰 HARGA SCRIPT\n\n' +
                        'Masukkan harga script (angka saja):\n\n' +
                        'Contoh: 50000\n\n' +
                        'Ketik "cancel" untuk membatalkan'
                    );
                    break;
                    
                case 2:
                    const price = parseInt(text.replace(/[^\d]/g, ''));
                    if (isNaN(price) || price < 1000) {
                        await ctx.reply(
                            '❌ Harga tidak valid!\n' +
                            'Masukkan angka yang valid (minimal 1000).\n\n' +
                            'Contoh: 50000\n\n' +
                            'Ketik "cancel" untuk membatalkan'
                        );
                        return;
                    }
                    
                    console.log(`💰 User ${userId} memasukkan harga script: ${price}`);
                    state.price = price;
                    state.step = 3;
                    userStates.set(userId, state);
                    
                    await ctx.reply(
                        '📝 DESKRIPSI SCRIPT\n\n' +
                        'Masukkan deskripsi script:\n\n' +
                        'Contoh: "Bot untuk auto claim coin, support multi account, easy setup"\n\n' +
                        'Ketik "cancel" untuk membatalkan'
                    );
                    break;
                    
                case 3:
                    console.log(`📝 User ${userId} memasukkan deskripsi script`);
                    state.description = text;
                    state.step = 4;
                    userStates.set(userId, state);
                    
                    await ctx.reply(
                        '🔧 FITUR SCRIPT\n\n' +
                        'Masukkan fitur-fitur script:\n\n' +
                        'Contoh: "• Auto claim coin\n• Multi account\n• Proxy support\n• No ban"\n\n' +
                        'Ketik "cancel" untuk membatalkan'
                    );
                    break;
                    
                case 4:
                    console.log(`🔧 User ${userId} memasukkan fitur script`);
                    state.features = text;
                    state.step = 5;
                    userStates.set(userId, state);
                    
                    await ctx.reply(
                        '📦 KIRIM FILE SCRIPT\n\n' +
                        'Kirim file script (format .zip, .rar, .py, .js, dll):\n\n' +
                        '⚠️ Maksimal 50MB\n' +
                        '💡 Rekomendasi: kompres ke .zip dulu\n\n' +
                        'Ketik "cancel" untuk membatalkan'
                    );
                    break;
            }
            return;
        }
        
        if (state?.action === 'ADMIN_ADD_STOCK') {
            if (!state.step) state.step = 1;
            
            switch(state.step) {
                case 1:
                    if (!text.startsWith('S') || text.length < 2) {
                        await ctx.reply(
                            '❌ FORMAT ID SCRIPT SALAH!\n\n' +
                            'Format yang benar: Sxxxxxxxxx\n' +
                            'Contoh: S1767057123264\n\n' +
                            'Masukkan lagi ID script yang benar:\n\n' +
                            'Ketik "cancel" untuk membatalkan'
                        );
                        return;
                    }
                    
                    try {
                        const script = await db.getScript(text);
                        if (!script) {
                            await ctx.reply(
                                '❌ SCRIPT TIDAK DITEMUKAN!\n\n' +
                                `Script dengan ID "${text}" tidak ditemukan.\n` +
                                'Pastikan ID script benar.\n\n' +
                                'Masukkan lagi ID script:\n\n' +
                                'Ketik "cancel" untuk membatalkan'
                            );
                            return;
                        }
                        
                        console.log(`📈 User ${userId} menambah stok script: ${script.id} - ${script.name}`);
                        state.scriptId = text;
                        state.scriptName = script.name;
                        state.currentStock = script.stock;
                        state.step = 2;
                        userStates.set(userId, state);
                        
                        await ctx.reply(
                            `📈 TAMBAH STOK SCRIPT\n\n` +
                            `📦 Script: ${script.name}\n` +
                            `💰 Harga: ${formatRp(script.price)}\n` +
                            `📊 Stok Saat Ini: ${script.stock}\n\n` +
                            `Masukkan jumlah stok yang ingin ditambahkan:\n\n` +
                            `Contoh: 10 (untuk menambah 10 stok)\n` +
                            `⚠️ Minimal 1, maksimal 1000\n\n` +
                            `Ketik "cancel" untuk membatalkan`
                        );
                    } catch (error) {
                        console.error('Error fetching script:', error);
                        await ctx.reply('❌ Error mengambil data script. Silakan coba lagi.');
                    }
                    break;
                    
                case 2:
                    const quantity = parseInt(text.replace(/[^\d]/g, ''));
                    if (isNaN(quantity) || quantity < 1 || quantity > 1000) {
                        await ctx.reply(
                            '❌ JUMLAH STOK TIDAK VALID!\n\n' +
                            'Masukkan angka antara 1-1000.\n' +
                            'Contoh: 10\n\n' +
                            'Masukkan lagi jumlah stok:\n\n' +
                            'Ketik "cancel" untuk membatalkan'
                        );
                        return;
                    }
                    
                    try {
                        const result = await db.addScriptStock(state.scriptId, quantity);
                        
                        if (result.success) {
                            userStates.delete(userId);
                            
                            console.log(`✅ User ${userId} berhasil menambah stok: +${quantity} untuk script ${state.scriptName}`);
                            
                            await ctx.reply(
                                `✅ STOK BERHASIL DITAMBAHKAN!\n\n` +
                                `📦 Script: ${state.scriptName}\n` +
                                `📈 Stok ditambahkan: +${quantity}\n` +
                                `📊 Stok sekarang: ${result.script.stock}\n` +
                                `💰 Harga: ${formatRp(result.script.price)}\n\n` +
                                `Status: ${result.script.status === 'available' ? '✅ TERSEDIA' : '❌ HABIS'}\n\n` +
                                `Script siap dijual kembali!`,
                                {
                                    reply_markup: {
                                        inline_keyboard: [
                                            [{ text: '📦 Lihat Script', callback_data: 'nav_scripts' }],
                                            [{ text: '📈 Tambah Stok Lagi', callback_data: 'admin_add_stock' }],
                                            [{ text: '👑 Admin Panel', callback_data: 'nav_admin' }]
                                        ]
                                    }
                                }
                            );
                        } else {
                            await ctx.reply(
                                `❌ GAGAL MENAMBAH STOK!\n\n` +
                                `Error: ${result.message}\n\n` +
                                `Silakan coba lagi atau hubungi developer.`
                            );
                            userStates.delete(userId);
                        }
                    } catch (error) {
                        console.error('Error adding stock:', error);
                        await ctx.reply('❌ Terjadi kesalahan saat menambah stok. Silakan coba lagi.');
                        userStates.delete(userId);
                    }
                    break;
            }
            return;
        }
        
        if (state?.action === 'BROADCAST_MESSAGE') {
            const users = await db.getUsers();
            let success = 0;
            let failed = 0;
            
            await ctx.reply(`🚀 Mulai mengirim ke ${users.length} user...`);
            
            for (let user of users) {
                try {
                    await ctx.telegram.sendMessage(
                        user.id,
                        `📢 PENGUMUMAN RESMI\n\n${text}\n\n— Ultimate Game Store`
                    );
                    success++;
                    
                    if (success % 10 === 0) {
                        console.log(`📤 Broadcast progress: ${success}/${users.length}`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    failed++;
                }
            }
            
            userStates.delete(userId);
            
            console.log(`✅ Broadcast completed: ${success} sent, ${failed} failed`);
            
            await ctx.reply(
                `✅ BROADCAST SELESAI!\n\n` +
                `📤 Terkirim: ${success} user\n` +
                `❌ Gagal: ${failed} user\n` +
                `📊 Total: ${users.length} user`
            );
            
            return;
        }
        
        if (!state) {
            await ctx.reply(
                '🤖 ULTIMATE GAME STORE BOT\n\n' +
                'Gunakan tombol menu untuk navigasi:\n\n' +
                '🔹 Klik tombol di bawah\n' +
                '🔹 Atau gunakan perintah /start',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🏠 Menu Utama', callback_data: 'nav_home' }],
                            [{ text: '🛒 Etalase Game', callback_data: 'nav_shop' }],
                            [{ text: '📦 Script Bot', callback_data: 'nav_scripts' }],
                            [{ text: '💳 Topup Saldo', callback_data: 'nav_deposit' }],
                            [{ text: '👤 Profile', callback_data: 'nav_profile' }]
                        ]
                    }
                }
            );
        }
        
    } catch (error) {
        console.error('❌ Error in text handler:', error);
        await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
    }
});

// Handler untuk foto
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    
    console.log(`📸 Received photo from user ${userId}, state action: ${state?.action}`);
    
    if (state?.action === 'ADMIN_ADD_PRODUCT' && state.step === 7) {
        try {
            console.log(`📸 Processing product photo for user ${userId}`);
            
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const fileId = photo.file_id;
            
            console.log(`📸 Photo details:`, {
                file_id: fileId,
                file_size: photo.file_size,
                width: photo.width,
                height: photo.height
            });
            
            state.photo_id = fileId;
            state.step = 'save';
            userStates.set(userId, state);
            
            await ctx.reply(
                '✅ Foto produk diterima!\n\n' +
                '🔄 Menyimpan produk ke database...'
            );
            
            console.log(`📸 Saving product with photo for user ${userId}`);
            await saveProductToDatabase(ctx, userId, state);
            
        } catch (error) {
            console.error('❌ Error processing photo:', error);
            await ctx.reply(
                '❌ Gagal memproses foto.\n' +
                'Silakan coba lagi atau hubungi developer.',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                        ]
                    }
                }
            );
            userStates.delete(userId);
        }
        return;
    }
    
    await ctx.reply(
        '📸 FOTO DITERIMA\n\n' +
        'Untuk menambahkan foto ke produk:\n' +
        '1. Akses Admin Panel\n' +
        '2. Pilih "Tambah Produk"\n' +
        '3. Ikuti instruksi sampai diminta kirim foto\n\n' +
        'Foto akan otomatis tersimpan sebagai foto produk.',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👑 Admin Panel', callback_data: 'nav_admin' }],
                    [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                ]
            }
        }
    );
});

bot.on('document', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const document = ctx.message.document;
    
    console.log(`📄 Received document from user ${userId}: ${document.file_name} (${document.file_size} bytes)`);
    
    if (state?.action === 'ADMIN_ADD_SCRIPT' && state.step === 5) {
        try {
            if (document.file_size > 50 * 1024 * 1024) {
                await ctx.reply(
                    '❌ FILE TERLALU BESAR!\n\n' +
                    'Maksimal file size: 50MB\n' +
                    'Ukuran file Anda: ' + Math.round(document.file_size / (1024 * 1024)) + 'MB\n\n' +
                    'Silakan kompres file atau gunakan file yang lebih kecil.'
                );
                return;
            }
            
            const allowedExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.py', '.js', '.txt', '.json', '.env'];
            const fileExt = document.file_name.substring(document.file_name.lastIndexOf('.')).toLowerCase();
            
            if (!allowedExtensions.includes(fileExt)) {
                await ctx.reply(
                    '❌ FORMAT FILE TIDAK DIDUKUNG!\n\n' +
                    'Format yang didukung: ' + allowedExtensions.join(', ') + '\n' +
                    'File Anda: ' + document.file_name + '\n\n' +
                    'Silakan kompres ke format .zip atau gunakan format yang didukung.'
                );
                return;
            }
            
            console.log(`📦 Adding script to database: ${state.name}, file: ${document.file_name}`);
            
            const newScript = await db.addScript({
                name: state.name,
                price: state.price,
                description: state.description,
                features: state.features,
                file_id: document.file_id,
                file_name: document.file_name,
                file_size: document.file_size,
                file_type: fileExt
            });
            
            userStates.delete(userId);
            
            console.log(`✅ Script added successfully: ${newScript.id} - ${newScript.name}`);
            
            await ctx.reply(
                `✅ SCRIPT BOT BERHASIL DITAMBAHKAN!\n\n` +
                `📦 Nama: ${state.name}\n` +
                `💰 Harga: ${formatRp(state.price)}\n` +
                `📝 Deskripsi: ${state.description.substring(0, 100)}...\n` +
                `📁 File: ${document.file_name} (${Math.round(document.file_size / 1024)} KB)\n` +
                `🔧 Fitur: ${state.features.split('\n').length} fitur\n` +
                `📊 Stok: ${newScript.stock} unit\n\n` +
                `Script sekarang tersedia untuk dijual!`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [Markup.button.callback('📦 Lihat Script', 'nav_scripts')],
                            [Markup.button.callback('➕ Tambah Script Lagi', 'admin_add_script')],
                            [Markup.button.callback('🏠 Beranda', 'nav_home')]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('❌ Error adding script:', error);
            await ctx.reply('❌ Gagal menambahkan script. Silakan coba lagi.');
        }
        return;
    }
    
    await ctx.reply(
        '📁 FILE DITERIMA\n\n' +
        'Untuk mengupload script bot:\n' +
        '1. Akses Admin Panel\n' +
        '2. Pilih "Tambah Script Bot"\n' +
        '3. Ikuti instruksi sampai diminta kirim file\n\n' +
        'Format file yang didukung:\n' +
        '• .zip, .rar, .7z (direkomendasikan)\n' +
        '• .py, .js, .txt\n' +
        '• Maksimal 50MB',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👑 Admin Panel', callback_data: 'nav_admin' }],
                    [{ text: '🏠 Beranda', callback_data: 'nav_home' }]
                ]
            }
        }
    );
});

bot.catch((error, ctx) => {
    console.error(`\n❌ [GLOBAL ERROR] ${error.message}`);
    console.error('Stack:', error.stack);
    
    if (error.message.includes('message is not modified')) {
        return;
    }
    
    try {
        if (ctx && ctx.reply) {
            ctx.reply('❌ Terjadi kesalahan sistem. Silakan coba lagi atau hubungi admin.');
        }
    } catch (e) {
        console.error('Cannot send error message to user:', e.message);
    }
});

setInterval(() => {
    const now = Date.now();
    const expiredTime = 24 * 60 * 60 * 1000;
    
    for (const [userId, messages] of qrisMessages.entries()) {
        const activeMessages = messages.filter(m => now - m.timestamp < expiredTime);
        
        if (activeMessages.length > 0) {
            qrisMessages.set(userId, activeMessages);
        } else {
            qrisMessages.delete(userId);
        }
    }
}, 60 * 60 * 1000);

process.once('SIGINT', () => {
    console.log('\n🛑 Stopping bot...');
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('\n🛑 Terminating bot...');
    bot.stop('SIGTERM');
    process.exit(0);
});

// Import Markup untuk digunakan di dalam file
const { Markup } = require('telegraf');

startBot();

module.exports = bot;