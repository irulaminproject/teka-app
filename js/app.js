// 1. Inisialisasi Telegram & Supabase
const tg = window.Telegram.WebApp;
const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// State Global
let currentOrder = null;

// Siapkan aplikasi
tg.ready();
tg.expand();

// JALANKAN PROSES UTAMA
initTeka();

async function initTeka() {
    const user = tg.initDataUnsafe?.user;

    // 1. Tampilkan Profil User (Optional)
    if (user) {
        const nameElement = document.getElementById('user-name');
        if (nameElement) nameElement.innerText = user.first_name;
        
        // Simpan ke profiles (Backup pendaftaran selain dari Bot)
        await _supabase.from('profiles').upsert({ 
            telegram_id: user.id.toString(), 
            full_name: `${user.first_name} ${user.last_name || ''}`
        }, { onConflict: 'telegram_id' });
    }

    // 2. Ambil Daftar Produk
    loadProducts();
}

async function loadProducts() {
    console.log("Sedang mengambil data barang...");
    
    const { data: products, error } = await _supabase
        .from('products')
        .select(`
            id, 
            name, 
            price, 
            image_url,
            stores (id, store_name)
        `)
        .eq('is_available', true); // Pastikan nama kolom di DB kamu benar 'is_available'

    // SESUAIKAN DENGAN ID DI INDEX.HTML
    const container = document.getElementById('product-list'); 
    if (!container) {
        console.error("ID product-list tidak ditemukan di HTML!");
        return;
    }

    if (error) {
        console.error("Fetch Error:", error.message);
        container.innerHTML = `<p style="text-align:center; color:red;">Gagal memuat: ${error.message}</p>`;
        return;
    }

    if (products && products.length > 0) {
        container.innerHTML = ''; // Hapus skeleton loading

        products.forEach(item => {
            const productCard = document.createElement('div');
            productCard.className = 'product-card';
            productCard.onclick = () => handleOrder(item.id, item.name, item.price, item.stores?.id || '');

            productCard.innerHTML = `
                <div class="product-img">
                    ${item.image_url ? `<img src="${item.image_url}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">` : '📦'}
                </div>
                <div class="product-info">
                    <div class="product-name">${item.name}</div>
                    <div class="product-price">Rp ${item.price.toLocaleString('id-ID')}</div>
                    <div class="product-desc">${item.stores ? item.stores.store_name : 'Toko TEKA'}</div>
                </div>
            `;
            container.appendChild(productCard);
        });
    } else {
        container.innerHTML = '<div id="empty-state">Belum ada barang tersedia.</div>';
    }
}

// Fungsi saat produk diklik
function handleOrder(productId, productName, productPrice, storeId) {
    currentOrder = { id: productId, name: productName, price: productPrice, store_id: storeId };
    
    tg.MainButton.setText(`AMBIL ${productName.toUpperCase()} - Rp ${productPrice.toLocaleString('id-ID')}`);
    tg.MainButton.setParams({
        color: '#0088cc', 
        text_color: '#ffffff'
    });
    tg.MainButton.show();
    tg.HapticFeedback.impactOccurred('medium');
}

// Handler Checkout (Main Button)
tg.MainButton.onClick(async () => {
    if (!currentOrder) return;
    
    tg.MainButton.showProgress();
    
    try {
        const user = tg.initDataUnsafe?.user;
        if (!user) throw new Error("User tidak terdeteksi");

        const { data: order, error: orderError } = await _supabase
            .from('orders')
            .insert({
                customer_tg_id: user.id.toString(),
                buyer_tg_id: user.id.toString(),
                store_id: currentOrder.store_id,
                total_price: currentOrder.price,
                status: 'pending'
            })
            .select().single();

        if (orderError) throw orderError;

        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert(`Sipp! Pesanan ${currentOrder.name} sedang diproses.`);
        tg.MainButton.hide();

    } catch (err) {
        tg.showAlert("Gagal: " + err.message);
    } finally {
        tg.MainButton.hideProgress();
    }
});
