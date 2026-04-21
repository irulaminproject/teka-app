/**
 * TEKA-App Core Logic
 * Multimedia Designer Style: Clean, Minimalist, & Functional
 */

// 1. INISIALISASI
const tg = window.Telegram.WebApp;
const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// State Management
let currentOrder = null;
let allProducts = [];

// Siapkan Telegram UI
tg.ready();
tg.expand();
tg.enableClosingConfirmation(); // Mencegah app tertutup gak sengaja

// Jalankan sistem utama
initTekaApp();

/**
 * Fungsi Utama saat Aplikasi Dibuka
 */
async function initTekaApp() {
    console.log("🚀 Menjalankan TEKA-App...");
    const user = tg.initDataUnsafe?.user;

    // A. Sinkronisasi Profil User ke Database
    if (user) {
        // Tampilkan Nama di Header
        const userInfo = document.getElementById('user-info');
        if (userInfo) userInfo.innerHTML = `Pesanan untuk <b>${user.first_name}</b> 📍`;

        try {
            await _supabase.from('profiles').upsert({ 
                telegram_id: user.id.toString(), 
                full_name: `${user.first_name} ${user.last_name || ''}`,
                updated_at: new Date()
            }, { onConflict: 'telegram_id' });
            console.log("✅ Profil user tersinkronisasi.");
        } catch (err) {
            console.error("❌ Gagal update profil:", err);
        }
    }

    // B. Load Data Barang
    loadProducts();
}

/**
 * Fungsi Mengambil Izin Lokasi dari Telegram
 */
function requestUserLocation() {
    return new Promise((resolve) => {
        // Cek jika API tersedia (TWA versi terbaru)
        if (!tg.getLocation) {
            console.warn("Fitur lokasi tidak didukung di versi Telegram ini.");
            resolve(null);
            return;
        }

        tg.getLocation((data) => {
            if (data) {
                console.log("📍 Lokasi user didapat:", data.latitude, data.longitude);
                resolve({ lat: data.latitude, lon: data.longitude });
            } else {
                console.warn("📍 Akses lokasi ditolak user.");
                resolve(null);
            }
        });
    });
}

/**
 * Mengambil Daftar Produk dari Supabase
 */
async function loadProducts() {
    const { data: products, error } = await _supabase
        .from('products')
        .select(`
            id, 
            name, 
            price, 
            image_url, 
            description,
            store_id,
            stores (
                id, 
                store_name, 
                store_latitude, 
                store_longitude
            )
        `)
        .eq('is_available', true);

    const container = document.getElementById('product-list'); 
    if (!container) return;

    if (error) {
        console.error("Fetch Error:", error.message);
        container.innerHTML = `<p style="color:red; padding:20px;">Gagal: ${error.message}</p>`;
        return;
    }

    if (products && products.length > 0) {
        container.innerHTML = ''; 
        products.forEach(item => {
            const card = document.createElement('div');
            card.className = 'product-card';
            
            // Perhatikan cara ambil koordinat dari relasi stores:
            card.onclick = () => {
                currentOrder = {
                    ...item,
                    // Kita pindahkan koordinat dari stores ke currentOrder agar mudah diakses saat insert
                    store_latitude: item.stores?.store_latitude,
                    store_longitude: item.stores?.store_longitude
                };
                
                tg.MainButton.setText(`AMBIL ${item.name.toUpperCase()} - Rp ${item.price.toLocaleString('id-ID')}`);
                tg.MainButton.show();
            };

            card.innerHTML = `
                <div class="product-img">
                    ${item.image_url ? `<img src="${item.image_url}" style="width:100%;height:100%;object-fit:cover;">` : '📦'}
                </div>
                <div class="product-info">
                    <div class="product-name">${item.name}</div>
                    <div class="product-price">Rp ${item.price.toLocaleString('id-ID')}</div>
                    <div class="product-meta">${item.stores?.store_name || 'Toko TEKA'}</div>
                </div>
            `;
            container.appendChild(card);
        });
    }
}

/**
 * Menampilkan Kartu Produk ke Layar
 */
function renderProductCards(items) {
    const container = document.getElementById('product-list');
    container.innerHTML = ''; // Hapus skeleton

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        // Event Klik untuk memilih barang
        card.onclick = () => selectItem(item);

        card.innerHTML = `
            <div class="product-img">
                ${item.image_url 
                    ? `<img src="${item.image_url}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;">` 
                    : '📦'}
            </div>
            <div class="product-info">
                <div class="product-name">${item.name}</div>
                <div class="product-price">Rp ${item.price.toLocaleString('id-ID')}</div>
                <div style="font-size: 11px; color: #888; margin-top: 4px;">
                    ${item.description || 'Barang berkualitas TEKA'}
                </div>
            </div>
            <div style="color: #FACC15; font-size: 20px;">➔</div>
        `;
        container.appendChild(card);
    });
}

/**
 * Aksi saat produk dipilih
 */
function selectItem(item) {
    currentOrder = item;
    
    // Aktifkan Main Button Telegram (Khas Marketplace)
    tg.MainButton.setText(`PESAN: ${item.name.toUpperCase()}`);
    tg.MainButton.setParams({
        color: '#FACC15',
        text_color: '#000000',
        is_active: true,
        is_visible: true
    });
    
    tg.HapticFeedback.impactOccurred('medium');
}

/**
 * HANDLING CHECKOUT (Klik Tombol Utama di Bawah)
 */
tg.MainButton.onClick(async () => {
    if (!currentOrder) return;

    // 1. Tampilkan loading di tombol
    tg.MainButton.showProgress();
    
    // 2. Minta Lokasi GPS Pembeli secara Real-time
    const userLoc = await requestUserLocation();

    try {
        const user = tg.initDataUnsafe?.user;
        if (!user) throw new Error("Otentikasi Telegram Gagal");

        // 3. Masukkan data ke tabel 'orders'
        // Kolom disesuaikan dengan database Boss (customer_tg_id & buyer_tg_id)
        const { data, error } = await _supabase
            .from('orders')
            .insert({
                customer_tg_id: user.id.toString(),
                buyer_tg_id: user.id.toString(),
                store_id: currentOrder.store_id,
                total_price: currentOrder.price,
                status: 'pending',
                
                // Koordinat Toko (dari data produk)
                store_latitude: currentOrder.store_latitude,
                store_longitude: currentOrder.store_longitude,
                
                // Koordinat Pembeli (dari GPS HP)
                dest_latitude: userLoc ? userLoc.lat : null,
                dest_longitude: userLoc ? userLoc.lon : null
            })
            .select();

        if (error) throw error;

        // 4. Sukses! Kasih feedback ke user
        tg.HapticFeedback.notificationOccurred('success');
        tg.showConfirm(`Pesanan ${currentOrder.name} berhasil dibuat! Mau lanjut belanja?`, (ok) => {
            if (!ok) tg.close(); // Tutup aplikasi kalau sudah selesai
        });
        
        tg.MainButton.hide();

    } catch (err) {
        tg.HapticFeedback.notificationOccurred('error');
        tg.showAlert("Gagal kirim pesanan: " + err.message);
    } finally {
        tg.MainButton.hideProgress();
    }
});

// Listener untuk perubahan tema (Dark Mode/Light Mode)
tg.onEvent('themeChanged', () => {
    document.body.style.backgroundColor = tg.backgroundColor;
});
