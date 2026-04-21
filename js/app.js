// 1. Inisialisasi
const tg = window.Telegram.WebApp;
const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

let currentOrder = null;

// Jalankan App
initTeka();

async function initTeka() {
    const user = tg.initDataUnsafe?.user;

    if (user) {
        // Tampilkan info user
        const infoDiv = document.getElementById('user-info');
        if (infoDiv) infoDiv.innerText = `Halo, ${user.first_name}! 👋`;

        // Auto-register ke profiles
        await _supabase.from('profiles').upsert({ 
            telegram_id: user.id.toString(), 
            full_name: `${user.first_name} ${user.last_name || ''}`
        }, { onConflict: 'telegram_id' });
    }

    loadProducts();
}

// Fungsi Ambil Izin Lokasi
function requestLocation() {
    return new Promise((resolve) => {
        // Cek apakah fitur tersedia
        if (!tg.getLocation) {
            resolve(null);
            return;
        }
        tg.getLocation((data) => {
            if (data) {
                resolve({ lat: data.latitude, lon: data.longitude });
            } else {
                resolve(null);
            }
        });
    });
}

async function loadProducts() {
    const { data: products, error } = await _supabase
        .from('products')
        .select('id,name,price,image_url,store_id,store_latitude,store_longitude');

    const container = document.getElementById('product-list'); 
    if (!container) return;

    if (error) {
        container.innerHTML = `<p style="color:red;">Gagal: ${error.message}</p>`;
        return;
    }

    if (products && products.length > 0) {
        container.innerHTML = ''; 
        products.forEach(item => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.onclick = () => {
                currentOrder = item;
                tg.MainButton.setText(`BELI ${item.name.toUpperCase()} - Rp ${item.price.toLocaleString('id-ID')}`);
                tg.MainButton.show();
            };

            card.innerHTML = `
                <div class="product-img">
                    ${item.image_url ? `<img src="${item.image_url}" style="width:100%;height:100%;object-fit:cover;">` : '📦'}
                </div>
                <div class="product-info">
                    <div class="product-name">${item.name}</div>
                    <div class="product-price">Rp ${item.price.toLocaleString('id-ID')}</div>
                </div>
            `;
            container.appendChild(card);
        });
    }
}

// Handler Checkout (Main Button)
tg.MainButton.onClick(async () => {
    if (!currentOrder) return;
    
    tg.MainButton.showProgress();
    
    // Minta Lokasi User
    const userLoc = await requestLocation();
    
    try {
        const user = tg.initDataUnsafe?.user;
        if (!user) throw new Error("User tidak terdeteksi");

        const { error: orderError } = await _supabase
            .from('orders')
            .insert({
                customer_tg_id: user.id.toString(),
                buyer_tg_id: user.id.toString(),
                store_id: currentOrder.store_id,
                total_price: currentOrder.price,
                status: 'pending',
                // Masukkan Koordinat Toko dari database produk
                store_latitude: currentOrder.store_latitude,
                store_longitude: currentOrder.store_longitude,
                // Masukkan Koordinat Pembeli dari GPS
                dest_latitude: userLoc ? userLoc.lat : null,
                dest_longitude: userLoc ? userLoc.lon : null
            });

        if (orderError) throw orderError;

        tg.showAlert("Pesanan berhasil dikirim! Kurir akan segera meluncur.");
        tg.MainButton.hide();

    } catch (err) {
        tg.showAlert("Waduh, gagal: " + err.message);
    } finally {
        tg.MainButton.hideProgress();
    }
});
