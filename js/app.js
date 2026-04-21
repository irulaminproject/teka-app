const tg = window.Telegram.WebApp;
const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

let currentOrder = null;

tg.ready();
tg.expand();

// Inisialisasi
initApp();

async function initApp() {
    const user = tg.initDataUnsafe?.user;
    if (user) {
        document.getElementById('user-info').innerText = `Halo, ${user.first_name} 👋`;
        // Sync ke profiles
        await _supabase.from('profiles').upsert({ 
            telegram_id: user.id.toString(), 
            full_name: `${user.first_name} ${user.last_name || ''}`
        }, { onConflict: 'telegram_id' });
    }
    loadProducts();
}

// Fungsi Minta Lokasi GPS Pembeli
function getGPS() {
    return new Promise((resolve) => {
        if (!tg.getLocation) return resolve(null);
        tg.getLocation((res) => resolve(res ? { lat: res.latitude, lon: res.longitude } : null));
    });
}

async function loadProducts() {
    const container = document.getElementById('product-list');
    
    // FIX: Ambil latitude/longitude dari tabel STORES (bukan products)
    const { data: products, error } = await _supabase
        .from('products')
        .select(`
            id, name, price, image_url, store_id,
            stores ( store_name, latitude, longitude )
        `)
        .eq('is_available', true);

    if (error) {
        container.innerHTML = `<p style="color:red">Error: ${error.message}</p>`;
        return;
    }

    container.innerHTML = '';
    products.forEach(item => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => {
            // Simpan data order + koordinat toko hasil join
            currentOrder = {
                ...item,
                store_lat: item.stores?.latitude,
                store_lon: item.stores?.longitude
            };
            tg.MainButton.setText(`PESAN ${item.name.toUpperCase()}`);
            tg.MainButton.setParams({ color: '#FACC15', text_color: '#000000' });
            tg.MainButton.show();
            tg.HapticFeedback.impactOccurred('medium');
        };

        card.innerHTML = `
            <div class="product-img">
                <img src="${item.image_url}" style="width:100%;height:100%;object-fit:cover;">
            </div>
            <div class="product-info">
                <div class="store-tag">${item.stores?.store_name || 'Toko TEKA'}</div>
                <div class="product-name">${item.name}</div>
                <div class="product-price">Rp ${item.price.toLocaleString('id-ID')}</div>
            </div>
        `;
        container.appendChild(card);
    });
}

// PROSES CHECKOUT
tg.MainButton.onClick(async () => {
    if (!currentOrder) return;
    tg.MainButton.showProgress();

    // 1. Ambil GPS User
    const gps = await getGPS();

    try {
        const user = tg.initDataUnsafe?.user;
        
        // 2. Insert ke Tabel Orders
        const { error: err } = await _supabase.from('orders').insert({
            customer_tg_id: user.id.toString(),
            buyer_tg_id: user.id.toString(),
            store_id: currentOrder.store_id,
            total_price: currentOrder.price,
            status: 'pending',
            // Koordinat Toko (Hasil Join tadi)
            store_latitude: currentOrder.store_lat,
            store_longitude: currentOrder.store_lon,
            // Koordinat Pembeli (Dari GPS)
            dest_latitude: gps ? gps.lat : null,
            dest_longitude: gps ? gps.lon : null
        });

        if (err) throw err;

        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert("Pesanan Berhasil! Lokasi toko dan lokasimu sudah tercatat. ✅");
        tg.MainButton.hide();

    } catch (e) {
        tg.showAlert("Gagal: " + e.message);
    } finally {
        tg.MainButton.hideProgress();
    }
});
