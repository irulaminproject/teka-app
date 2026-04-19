const tg = window.Telegram.WebApp;
const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
tg.ready();

async function loadOrders() {
    const { data: orders, error } = await _supabase
        .from('orders')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false });

    const container = document.getElementById('seller-orders-container');
    if (orders && orders.length > 0) {
        container.innerHTML = orders.map(ord => `
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-blue-100">
                <div class="flex justify-between mb-2">
                    <span class="text-[10px] font-bold text-blue-500 uppercase">Order #${ord.id.slice(0,5)}</span>
                    <span class="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded-lg font-bold">${ord.status}</span>
                </div>
                <h3 class="font-bold text-gray-800">${ord.profiles?.full_name || 'Pembeli'}</h3>
                <p class="text-lg font-black text-gray-900">Rp${ord.total_price.toLocaleString('id-ID')}</p>
                <button class="w-full mt-3 bg-blue-600 text-white py-2 rounded-xl text-xs font-bold uppercase tracking-wider">Siapkan & Kirim</button>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<p class="text-center text-gray-400">Belum ada pesanan.</p>';
    }
}
loadOrders();