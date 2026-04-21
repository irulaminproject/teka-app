const tg = window.Telegram.WebApp;
const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

let currentOrder = null;

tg.ready();
tg.expand();

initTeka();

async function initTeka() {
    const user = tg.initDataUnsafe?.user;
    if (user) {
        document.getElementById('user-name').innerText = `Halo, ${user.first_name}!`;
        
        // Simpan/Update Profile
        await _supabase.from('profiles').upsert({ 
            telegram_id: user.id.toString(), 
            full_name: `${user.first_name} ${user.last_name || ''}`
        }, { onConflict: 'telegram_id' });
    }
    loadProducts();
}

async function loadProducts() {
    const container = document.getElementById('product-container');
    
    // AMBIL PRODUK + JOIN STORES (untuk dapat latitude & longitude toko)
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

    container.innerHTML = ''; // Bersihkan loading
    products.forEach(item => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.onclick = () => {
            // Simpan data ke state global
            currentOrder = {
                ...item,
                s_lat: item.stores?.latitude,
                s_lon: item.stores?.longitude
            };
            tg.MainButton.setText(`BELI ${item.name.toUpperCase()} - Rp${item.price.toLocaleString()}`);
            tg.MainButton.show();
        };

        div.innerHTML = `
            <img class="product-img" src="${item.image_url || 'https://via.placeholder.com/150'}">
            <div class="product-info">
                <div style="font-size:12px; color:orange; font-weight:bold;">${item.stores?.store_name || 'Toko'}</div>
                <div style="font-weight:bold;">${item.name}</div>
                <div class="price">Rp${item.price.toLocaleString()}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

tg.MainButton.onClick(async () => {
    if (!currentOrder) return;
    tg.MainButton.showProgress();

    // MINTA LOKASI USER (Biar gak null)
    tg.getLocation(async (loc) => {
        try {
            const user = tg.initDataUnsafe?.user;
            
            const { error: orderError } = await _supabase.from('orders').insert({
                customer_tg_id: user.id.toString(),
                buyer_tg_id: user.id.toString(),
                store_id: currentOrder.store_id,
                total_price: currentOrder.price,
                status: 'pending',
                // Koordinat Toko (Hasil Join)
                store_latitude: currentOrder.s_lat,
                store_longitude: currentOrder.s_lon,
                // Koordinat Pembeli (GPS)
                dest_latitude: loc ? loc.latitude : null,
                dest_longitude: loc ? loc.longitude : null
            });

            if (orderError) throw orderError;

            tg.showAlert("Alhamdulillah, Pesanan Terkirim! ✅");
            tg.MainButton.hide();
        } catch (e) {
            tg.showAlert("Gagal: " + e.message);
        } finally {
            tg.MainButton.hideProgress();
        }
    });
});
