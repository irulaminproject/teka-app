// ==========================================
// 1. DATA INITIALIZATION (MENGGUNAKAN CONFIG.JS)
// ==========================================
const tg = window.Telegram.WebApp;
tg.expand();

// State Aplikasi
let currentOrder = null;
let userProfile = null;
let allStores = [];
let categories = [];

// ==========================================
// 2. FUNGSI PENGENAL IDENTITAS (BIAR GAK AMNESIA)
// ==========================================
async function checkIdentity() {
    const user = tg.initDataUnsafe?.user;
    
    // Update Tampilan Debug di HTML jika ada
    const debugName = document.getElementById('debug-name');
    const debugId = document.getElementById('debug-id');
    const debugUuid = document.getElementById('debug-uuid');

    if (user) {
        if (debugName) debugName.innerText = user.first_name;
        if (debugId) debugId.innerText = user.id;

        // Ambil UUID dari database agar buyer_id tidak NULL
        const { data: profile } = await _supabase
            .from('profiles')
            .select('id')
            .eq('telegram_id', user.id)
            .single();

        if (profile) {
            userProfile = profile;
            if (debugUuid) debugUuid.innerText = profile.id;
        } else {
            if (debugUuid) debugUuid.innerText = "Belum Terdaftar";
        }
    }
}

// ==========================================
// 3. LOGIKA RENDER TOKO & PRODUK (OPERASIONAL)
// ==========================================
async function loadAppData() {
    // Ambil data Toko, Produk, dan Kategori secara utuh
    const { data: stores } = await _supabase.from('stores').select('*, pangkalan(*)');
    const { data: cats } = await _supabase.from('categories').select('*');
    
    allStores = stores || [];
    categories = cats || [];
    
    renderCategories();
    renderStores(allStores);
}

function renderCategories() {
    const container = document.getElementById('category-container');
    if (!container) return;
    container.innerHTML = categories.map(cat => `
        <div class="category-card" onclick="filterByCategory('${cat.id}')">
            <img src="${cat.icon_url}" />
            <span>${cat.name}</span>
        </div>
    `).join('');
}

function renderStores(storesToRender) {
    const container = document.getElementById('store-container');
    if (!container) return;
    container.innerHTML = storesToRender.map(store => `
        <div class="store-card" onclick="showStoreDetail('${store.id}')">
            <h3>${store.store_name}</h3>
            <p>${store.address}</p>
        </div>
    `).join('');
}

// ==========================================
// 4. FUNGSI SELEKSI PRODUK
// ==========================================
function selectProduct(name, price, storeId) {
    currentOrder = { name, price, store_id: storeId };
    
    tg.MainButton.setParams({
        text: `BELI ${name.toUpperCase()} (Rp${price.toLocaleString('id-ID')})`,
        color: '#2ecc71',
        is_visible: true
    });
}

// ==========================================
// 5. FUNGSI CHECKOUT & DOUBLE NOTIFICATION (INVOICE)
// ==========================================
tg.MainButton.onClick(async () => {
    if (!currentOrder) return;

    tg.MainButton.showProgress(); 
    
    const user = tg.initDataUnsafe?.user;
    if (!user) {
        tg.showAlert("Gunakan Telegram untuk melakukan pemesanan.");
        tg.MainButton.hideProgress();
        return;
    }

    // A. Ambil ID Internal Profile (Pastikan tidak null)
    let profile = userProfile;
    if (!profile) {
        const { data: p } = await _supabase
            .from('profiles')
            .select('id')
            .eq('telegram_id', user.id)
            .single();
        profile = p;
    }

    if (!profile) {
        tg.showAlert("Data profil tidak ditemukan. Harap refresh aplikasi.");
        tg.MainButton.hideProgress();
        return;
    }

    // B. Simpan data ke tabel Orders
    const { data: order, error: orderError } = await _supabase
        .from('orders')
        .insert({
            buyer_id: profile.id,
            store_id: currentOrder.store_id || null,
            total_price: currentOrder.price,
            status: 'pending'
        })
        .select() 
        .single();

    if (orderError) {
        tg.showAlert("Gagal membuat pesanan: " + orderError.message);
        tg.MainButton.hideProgress();
        return;
    }

    // C. Ambil Info Toko & Grup Telegram Wilayah
    const { data: storeInfo } = await _supabase
        .from('stores')
        .select('store_name, pangkalan(telegram_group_id)')
        .eq('id', currentOrder.store_id)
        .single();

    // D. Siapkan Format Invoice Digital
    const invoiceContent = `🧾 *INVOICE TEKA-APP*\n` +
                           `ID Order: #ORD-${order.id.slice(0, 8)}\n` +
                           `------------------------------------------\n` +
                           `👤 *Pembeli:* ${user.first_name}\n` +
                           `🛍️ *Produk:* ${currentOrder.name}\n` +
                           `💰 *Total:* Rp${currentOrder.price.toLocaleString('id-ID')}\n` +
                           `🏪 *Toko:* ${storeInfo?.store_name || 'Toko TEKA'}\n` +
                           `------------------------------------------\n` +
                           `🕒 _Status: Menunggu Konfirmasi Kurir_`;

    // E. KIRIM KE GRUP KURIR
    const targetGroup = storeInfo?.pangkalan?.telegram_group_id;
    if (targetGroup) {
        await fetch(`https://api.telegram.org/bot8537812998:AAHEL4kqYY8mS4LLOuTZjbvf7vAnpusxjSM/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: targetGroup,
                text: `🚨 *ADA PESANAN BARU!*\n` + invoiceContent,
                parse_mode: "Markdown"
            })
        });
    }

    // F. KIRIM KE USER (INVOICE PRIBADI)
    await fetch(`https://api.telegram.org/bot8537812998:AAHEL4kqYY8mS4LLOuTZjbvf7vAnpusxjSM/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: user.id, 
            text: invoiceContent,
            parse_mode: "Markdown"
        })
    });

    tg.HapticFeedback.notificationOccurred('success');
    tg.showAlert(`Pesanan Berhasil! Invoice dikirim.`);
    tg.MainButton.hide();
    tg.MainButton.hideProgress();
});

// ==========================================
// 6. JALANKAN SEMUA SAAT STARTUP
// ==========================================
window.onload = () => {
    checkIdentity();
    loadAppData();
};
