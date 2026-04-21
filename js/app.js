// ==========================================
// 1. DATA INITIALIZATION
// ==========================================
const tg = window.Telegram.WebApp;
tg.expand();

let currentOrder = null;
let userProfile = null;
let allStores = [];
let categories = [];

// ==========================================
// 2. FUNGSI PENGENAL IDENTITAS (DENGAN PROTEKSI)
// ==========================================
async function checkIdentity() {
    try {
        const user = tg.initDataUnsafe?.user;
        if (!user) {
            console.warn("User data tidak terbaca dari Telegram.");
            return;
        }

        // Tampilkan ke UI Debug
        const debugName = document.getElementById('debug-name');
        const debugId = document.getElementById('debug-id');
        if (debugName) debugName.innerText = user.first_name;
        if (debugId) debugId.innerText = user.id;

        // Ambil UUID dari database Supabase
        const { data: profile, error } = await _supabase
            .from('profiles')
            .select('id')
            .eq('telegram_id', user.id)
            .single();

        if (profile) {
            userProfile = profile;
            const debugUuid = document.getElementById('debug-uuid');
            if (debugUuid) debugUuid.innerText = profile.id;
            console.log("Identitas dikenali:", profile.id);
        }
    } catch (err) {
        console.error("Gagal checkIdentity:", err.message);
    }
}

// ==========================================
// 3. LOGIKA RENDER DATA (DENGAN PROTEKSI)
// ==========================================
async function loadAppData() {
    try {
        // Ambil data Toko & Kategori
        const [storesRes, catsRes] = await Promise.all([
            _supabase.from('stores').select('*, pangkalan(*)'),
            _supabase.from('categories').select('*')
        ]);

        allStores = storesRes.data || [];
        categories = catsRes.data || [];
        
        // Cek apakah fungsi render ada sebelum dipanggil
        if (typeof renderCategories === "function") renderCategories();
        if (typeof renderStores === "function") renderStores(allStores);
        
        console.log("Data aplikasi berhasil dimuat.");
    } catch (err) {
        console.error("Gagal loadAppData:", err.message);
        // Jika gagal, pastikan loading screen tertutup agar tidak "Memuat terus"
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.style.display = 'none';
    }
}

// ==========================================
// 4. LOGIKA PEMILIHAN PRODUK
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
// 5. FUNGSI CHECKOUT & NOTIFIKASI
// ==========================================
tg.MainButton.onClick(async () => {
    if (!currentOrder) return;
    tg.MainButton.showProgress(); 
    
    try {
        const user = tg.initDataUnsafe?.user;
        
        // Cari profile jika belum ada
        if (!userProfile && user) {
            const { data: p } = await _supabase
                .from('profiles')
                .select('id')
                .eq('telegram_id', user.id)
                .single();
            userProfile = p;
        }

        if (!userProfile) {
            tg.showAlert("Profil tidak ditemukan. Refresh aplikasi!");
            tg.MainButton.hideProgress();
            return;
        }

        // Simpan Order
        const { data: order, error: orderError } = await _supabase
            .from('orders')
            .insert({
                buyer_id: userProfile.id,
                store_id: currentOrder.store_id || null,
                total_price: currentOrder.price,
                status: 'pending'
            })
            .select().single();

        if (orderError) throw orderError;

        // Ambil Info Toko
        const { data: storeInfo } = await _supabase
            .from('stores')
            .select('store_name, pangkalan(telegram_group_id)')
            .eq('id', currentOrder.store_id)
            .single();

        const invoice = `🧾 *INVOICE TEKA-APP*\nID: #ORD-${order.id.slice(0, 8)}\n💰 Total: Rp${currentOrder.price.toLocaleString('id-ID')}`;

        // Kirim Telegram (Bot API)
        const sendTele = async (chatId, text) => {
            if (!chatId) return;
            await fetch(`https://api.telegram.org/bot8537812998:AAHEL4kqYY8mS4LLOuTZjbvf7vAnpusxjSM/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" })
            });
        };

        await sendTele(storeInfo?.pangkalan?.telegram_group_id, `🚨 *PESANAN BARU!*\n` + invoice);
        await sendTele(user.id, invoice);

        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert(`Pesanan Berhasil!`);
        tg.MainButton.hide();
    } catch (err) {
        tg.showAlert("Terjadi kesalahan: " + err.message);
    } finally {
        tg.MainButton.hideProgress();
    }
});

// ==========================================
// 6. STARTUP (DENGAN PENANGANAN ERROR)
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // Jalankan tanpa menunggu satu sama lain agar tidak macet
    checkIdentity().catch(console.error);
    loadAppData().catch(console.error);
});
