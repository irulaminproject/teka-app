// ==========================================
// 1. INISIALISASI DASAR (TELEGRAM & SUPABASE)
// ==========================================
const tg = window.Telegram.WebApp;
const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// State untuk menyimpan data produk yang sedang dipilih
let currentOrder = null;

// Beritahu Telegram kalau aplikasi siap digunakan
tg.ready();
tg.expand();

// Jalankan fungsi utama saat aplikasi dibuka
initTeka();

// ==========================================
// 2. FUNGSI UTAMA (INIT & SYNC USER)
// ==========================================
// Fungsi untuk cek identitas saat startup
async function checkIdentity() {
    const user = tg.initDataUnsafe?.user;
    
    if (user) {
        document.getElementById('debug-name').innerText = user.first_name || 'Tidak ada nama';
        document.getElementById('debug-id').innerText = user.id || 'Tidak ada ID';

        // Coba cari di database Supabase
        const { data: profile, error } = await _supabase
            .from('profiles')
            .select('id')
            .eq('telegram_id', user.id)
            .single();

        if (profile) {
            document.getElementById('debug-uuid').innerText = profile.id;
            // Simpan ke window agar bisa dipakai fungsi checkout nanti
            window.currentUserProfile = profile; 
            console.log("Profile ditemukan:", profile.id);
        } else {
            document.getElementById('debug-uuid').innerText = "Belum terdaftar di DB";
            console.error("Profile Error:", error?.message);
        }
    } else {
        document.getElementById('debug-name').innerText = "Gagal baca initData";
    }
}

// Jalankan fungsinya
checkIdentity();

async function initTeka() {
    const user = tg.initDataUnsafe?.user;

    if (user) {
        // Tampilkan Identitas User di UI (Jika elemen ID ada di HTML)
        const nameElement = document.getElementById('user-name');
        if (nameElement) {
            nameElement.innerText = user.first_name;
        }
        
        const avatarContainer = document.getElementById('user-avatar');
        const photoElement = document.getElementById('user-photo');
        if (user.photo_url && avatarContainer && photoElement) {
            avatarContainer.classList.remove('hidden');
            photoElement.src = user.photo_url;
        }

        // Simpan atau Perbarui data user ke tabel Profiles di Supabase
        await _supabase.from('profiles').upsert({ 
            telegram_id: user.id, 
            full_name: `${user.first_name} ${user.last_name || ''}`,
            role: 'user'
        }, { onConflict: 'telegram_id' });
    }

    // Lanjut ambil daftar produk untuk dipajang
    loadProducts();
}

// ==========================================
// 3. FUNGSI LOAD PRODUK DARI DATABASE
// ==========================================
async function loadProducts() {
    const { data: products, error } = await _supabase
        .from('products')
        .select(`
            id, 
            name, 
            price, 
            image_url,
            stores (id, store_name)
        `)
        .eq('is_available', true);

    const container = document.getElementById('product-container');
    if (!container) return;

    if (error) {
        console.error("Gagal mengambil produk:", error.message);
        container.innerHTML = `<p class="text-center text-red-500">Gagal memuat produk.</p>`;
        return;
    }

    if (products && products.length > 0) {
        container.innerHTML = ''; // Kosongkan loader

        products.forEach(item => {
            const productHTML = `
                <div class="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                    <div class="w-full h-32 bg-gray-100 rounded-xl mb-3 overflow-hidden">
                        <img src="${item.image_url || 'https://via.placeholder.com/150'}" class="w-full h-full object-cover">
                    </div>
                    <p class="text-[10px] font-bold text-yellow-600 uppercase mb-1">
                        ${item.stores ? item.stores.store_name : 'Toko TEKA'}
                    </p>
                    <h3 class="font-bold text-sm text-gray-800 leading-tight mb-3">${item.name}</h3>
                    <div class="flex justify-between items-center mt-auto">
                        <span class="font-black text-sm text-gray-900">Rp${item.price.toLocaleString('id-ID')}</span>
                        <button onclick="handleOrder('${item.id}', '${item.name}', ${item.price}, '${item.stores?.id || ''}')" 
                                class="bg-yellow-400 hover:bg-yellow-500 text-black px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-colors">
                            Beli
                        </button>
                    </div>
                </div>
            `;
            container.innerHTML += productHTML;
        });
    } else {
        container.innerHTML = `<p class="text-center text-gray-400 py-10">Belum ada produk tersedia.</p>`;
    }
}

// ==========================================
// 4. FUNGSI HANDLING KLIK BELI
// ==========================================
function handleOrder(productId, productName, productPrice, storeId) {
    // Simpan data ke variabel global agar bisa diakses saat Checkout
    currentOrder = { id: productId, name: productName, price: productPrice, store_id: storeId };
    
    // Konfigurasi Tombol Utama Telegram (MainButton)
    tg.MainButton.setText(`KONFIRMASI: ${productName.toUpperCase()} - Rp${productPrice.toLocaleString('id-ID')}`);
    tg.MainButton.setParams({
        color: '#FACC15',
        text_color: '#000000'
    });
    tg.MainButton.show();
    
    // Getar HP user sedikit (Haptic Feedback)
    tg.HapticFeedback.impactOccurred('medium');
}


// ==========================================
// 5. FUNGSI CHECKOUT & DOUBLE NOTIFICATION (INVOICE)
// ==========================================
tg.MainButton.onClick(async () => {
    if (!currentOrder) return;

    // Tampilkan loading di MainButton agar user tidak klik berkali-kali
    tg.MainButton.showProgress(); 
    
    const user = tg.initDataUnsafe?.user;
    if (!user) {
        tg.showAlert("Gunakan Telegram untuk melakukan pemesanan.");
        tg.MainButton.hideProgress();
        return;
    }

    // A. Ambil ID Internal Profile Supabase
    const { data: profile, error: profileError } = await _supabase
        .from('profiles')
        .select('id')
        .eq('telegram_id', user.id)
        .single();

    if (profileError || !profile) {
        tg.showAlert("Data profil tidak ditemukan. Harap refresh aplikasi.");
        tg.MainButton.hideProgress();
        return;
    }

    // B. Simpan data ke tabel Orders
    const { data: order, error: orderError } = await _supabase
        .from('orders')
        .insert({
            buyer_id: profile.id, // PASTIKAN INI TERISI DARI HASIL QUERY DI ATAS
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

    // E. KIRIM KE GRUP KURIR (OPERASIONAL)
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
            chat_id: user.id, // Kirim ke chat pribadi pembeli
            text: invoiceContent,
            parse_mode: "Markdown"
        })
    });

    // G. SELESAI
    tg.HapticFeedback.notificationOccurred('success');
    tg.showAlert(`Pesanan ${currentOrder.name} Berhasil! Invoice telah dikirim ke chat Telegram Anda.`);
    tg.MainButton.hide();
    tg.MainButton.hideProgress();
});
