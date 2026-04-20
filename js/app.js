// 1. Inisialisasi Telegram & Supabase
const tg = window.Telegram.WebApp;
const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// State Global untuk menyimpan pesanan sementara
let currentOrder = null;

// Beritahu Telegram kalau aplikasi sudah siap
tg.ready();
tg.expand();

// Jalankan fungsi utama
initTeka();

async function initTeka() {
    const user = tg.initDataUnsafe?.user;

    if (user) {
        // Tampilkan Nama User di UI
        const nameElement = document.getElementById('user-name');
        if (nameElement) nameElement.innerText = user.first_name;
        
        // Tampilkan Foto jika ada
        if (user.photo_url) {
            const avatarContainer = document.getElementById('user-avatar');
            const photoElement = document.getElementById('user-photo');
            if (avatarContainer) avatarContainer.classList.remove('hidden');
            if (photoElement) photoElement.src = user.photo_url;
        }

        // Sinkronisasi User ke Database Profiles
        await _supabase.from('profiles').upsert({ 
            telegram_id: user.id, 
            full_name: `${user.first_name} ${user.last_name || ''}`,
            role: 'user'
        }, { onConflict: 'telegram_id' });
    }

    // Ambil daftar produk
    loadProducts();
}

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
        console.error("Fetch Error:", error.message);
        return;
    }

    if (products && products.length > 0) {
        container.innerHTML = ''; // Bersihkan container

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
    }
}

// Fungsi saat tombol "Beli" diklik (Memunculkan Tombol Kuning Telegram di bawah)
function handleOrder(productId, productName, productPrice, storeId) {
    currentOrder = { id: productId, name: productName, price: productPrice, store_id: storeId };
    
    tg.MainButton.setText(`BAYAR: ${productName.toUpperCase()} - Rp${productPrice.toLocaleString('id-ID')}`);
    tg.MainButton.setParams({
        color: '#FACC15', // Warna kuning
        text_color: '#000000'
    });
    tg.MainButton.show();
    tg.HapticFeedback.impactOccurred('medium');
}

// Event Listener saat Tombol Utama Telegram (MainButton) diklik untuk Checkout & Invoice
tg.MainButton.onClick(async () => {
    if (!currentOrder) return;

    tg.MainButton.showProgress(); 
    
    const user = tg.initDataUnsafe?.user;
    if (!user) {
        tg.showAlert("Gunakan Telegram untuk memesan.");
        tg.MainButton.hideProgress();
        return;
    }

    // 1. Ambil UUID Profile User
    const { data: profile } = await _supabase
        .from('profiles')
        .select('id')
        .eq('telegram_id', user.id)
        .single();

    if (profile) {
        // 2. Simpan ke tabel orders
        const { data: order, error } = await _supabase
            .from('orders')
            .insert({
                buyer_id: profile.id,
                store_id: currentOrder.store_id || null,
                total_price: currentOrder.price,
                status: 'pending'
            })
            .select()
            .single();

        if (!error) {
            // 3. Ambil data Toko & Grup Wilayah untuk Invoice
            const { data: info } = await _supabase
                .from('stores')
                .select('store_name, pangkalan(telegram_group_id)')
                .eq('id', currentOrder.store_id)
                .single();

            // 4. Kirim Invoice ke Grup Telegram Wilayah
            if (info?.pangkalan?.telegram_group_id) {
                const invoiceText = `🧾 *INVOICE DIGITAL #ORD-${order.id.slice(0, 8)}*\n` +
                                    `------------------------------------------\n` +
                                    `👤 *Pembeli:* ${user.first_name}\n` +
                                    `🏪 *Toko:* ${info.store_name}\n` +
                                    `🛍️ *Produk:* ${currentOrder.name}\n` +
                                    `💰 *Total Bayar:* Rp${currentOrder.price.toLocaleString('id-ID')}\n` +
                                    `------------------------------------------\n` +
                                    `🕒 _Status: Menunggu Konfirmasi Kurir_`;

                await fetch(`https://api.telegram.org/bot8537812998:AAHEL4kqYY8mS4LLOuTZjbvf7vAnpusxjSM/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: info.pangkalan.telegram_group_id,
                        text: invoiceText,
                        parse_mode: "Markdown"
                    })
                });
            }

            tg.HapticFeedback.notificationOccurred('success');
            tg.showAlert(`Pesanan Berhasil! Invoice telah dikirim ke grup wilayah.`);
            tg.MainButton.hide();
        } else {
            tg.showAlert("Gagal memesan: " + error.message);
        }
    } else {
        tg.showAlert("Profil tidak ditemukan. Coba refresh aplikasi.");
    }
    
    tg.MainButton.hideProgress();
});
