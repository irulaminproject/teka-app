const tg = window.Telegram.WebApp;
const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

let selectedItem = null;

tg.ready();
tg.expand();

// Tampilkan nama pembeli
if (tg.initDataUnsafe?.user) {
    document.getElementById('user-name').innerText = `Halo, ${tg.initDataUnsafe.user.first_name}`;
}

// 1. Fungsi Ambil Data Barang
async function loadData() {
    const container = document.getElementById('product-container');
    
    const { data: products, error } = await _supabase
        .from('products')
        .select(`
            id, name, price, image_url, store_id,
            stores ( store_name, latitude, longitude )
        `)
        .eq('is_available', true);

    if (error) {
        container.innerHTML = `<p style="color:red">Gagal ambil data: ${error.message}</p>`;
        return;
    }

    container.innerHTML = ''; // Hapus tulisan memuat
    products.forEach(item => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => {
            selectedItem = item;
            tg.MainButton.setText(`BELI ${item.name.toUpperCase()} - Rp${item.price.toLocaleString()}`);
            tg.MainButton.show();
        };

        card.innerHTML = `
            <img class="product-img" src="${item.image_url || ''}">
            <div class="product-info">
                <div style="font-size:10px; color:orange; font-weight:bold;">${item.stores?.store_name || 'Toko'}</div>
                <div style="font-weight:bold;">${item.name}</div>
                <div class="price">Rp${item.price.toLocaleString()}</div>
            </div>
        `;
        container.appendChild(card);
    });
}

// 2. Fungsi Checkout saat Tombol Kuning Telegram Diklik
tg.MainButton.onClick(async () => {
    if (!selectedItem) return;
    tg.MainButton.showProgress();

    // Minta lokasi HP pembeli (agar dest_latitude ada isinya)
    tg.getLocation(async (loc) => {
        try {
            const user = tg.initDataUnsafe?.user;
            
            // Simpan ke tabel orders (Nama kolom Sesuai CSV Boss)
            const { error: err } = await _supabase.from('orders').insert({
                customer_tg_id: user.id.toString(),
                buyer_tg_id: user.id.toString(),
                store_id: selectedItem.store_id,
                total_price: selectedItem.price,
                status: 'pending',
                // Koordinat Toko dari hasil Join
                store_latitude: selectedItem.stores?.latitude || null,
                store_longitude: selectedItem.stores?.longitude || null,
                // Koordinat Pembeli dari GPS HP
                dest_latitude: loc ? loc.latitude : null,
                dest_longitude: loc ? loc.longitude : null
            });

            if (err) throw err;

            tg.showAlert("✅ Berhasil! Pesanan sedang diproses.");
            tg.MainButton.hide();

        } catch (e) {
            tg.showAlert("❌ Error: " + e.message);
        } finally {
            tg.MainButton.hideProgress();
        }
    });
});

// Jalankan aplikasi
loadData();
