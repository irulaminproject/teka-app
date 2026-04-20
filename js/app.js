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
        const nameElement = document.getElementById('user-name');
        if (nameElement) nameElement.innerText = user.first_name;
        
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
        container.innerHTML = ''; 
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

function handleOrder(productId, productName, productPrice, storeId) {
    currentOrder = { id: productId, name: productName, price: productPrice, store_id: storeId };
    
    tg.MainButton.setText(`PESAN ${productName.toUpperCase()} - Rp${productPrice.toLocaleString('id-ID')}`);
    tg.MainButton.setParams({
        color: '#FACC15',
        text_color: '#000000'
    });
    tg.MainButton.show();
    tg.HapticFeedback.impactOccurred('medium');
}

// LOGIKA CHECKOUT & NOTIFIKASI OTOMATIS
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

    if (!profile) {
        tg.showAlert("Profil tidak ditemukan. Coba refresh aplikasi.");
        tg.MainButton.hideProgress();
        return;
    }

    // 2. Simpan ke tabel orders
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
        tg.showAlert("Gagal memesan: " + orderError.message);
        tg.MainButton.hideProgress();
        return;
    }

    // 3. LOGIKA NOTIFIKASI DINAMIS BERDASARKAN WILAYAH
    try {
        // Cari ID Grup Telegram Wilayah dari relasi tabel stores -> pangkalan
        const { data: info } = await _supabase
            .from('stores')
            .select(`
                store_name,
                pangkalan (telegram_group_id)
            `)
            .eq('id', currentOrder.store_id)
            .single();

        const targetGroup = info?.pangkalan?.telegram_group_id;

        // Jika grup wilayah ditemukan, kirim pesan ke sana
        if (targetGroup) {
            const message = `📦 *ORDER BARU MASUK*\n\n` +
                            `👤 Pembeli: ${user.first_name}\n` +
                            `🛍️ Produk: ${currentOrder.name}\n` +
                            `💰 Total: Rp${currentOrder.price.toLocaleString('id-ID')}\n` +
                            `🏪 Toko: ${info.store_name}\n\n` +
                            `🚨 *Kurir Wilayah:* Harap segera diproses!`;

            await fetch(`https://api.telegram.org/bot8537812998:AAHEL4kqYY8mS4LLOuTZjbvf7vAnpusxjSM/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: targetGroup,
                    text: message,
                    parse_mode: "Markdown"
                })
            });
        }

        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert(`Pesanan ${currentOrder.name} Berhasil! Notifikasi telah dikirim ke kurir wilayah.`);
        tg.MainButton.hide();

    } catch (err) {
        console.error("Notif Error:", err);
        tg.showAlert("Pesanan tercatat, namun notifikasi grup gagal terkirim.");
    }
    
    tg.MainButton.hideProgress();
});
