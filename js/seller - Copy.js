const tg = window.Telegram.WebApp;
const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
tg.ready();

async function loadTasks() {
    const { data: tasks } = await _supabase
        .from('orders')
        .select('*, profiles(full_name)')
        .eq('status', 'ready_to_ship');

    const container = document.getElementById('kurir-tasks-container');
    if (tasks && tasks.length > 0) {
        container.innerHTML = tasks.map(tk => `
            <div class="bg-white p-4 rounded-2xl border-l-4 border-green-500 shadow-sm">
                <p class="text-xs text-gray-500 font-bold uppercase">Kirim Ke:</p>
                <h3 class="text-lg font-black text-gray-800">${tk.profiles?.full_name}</h3>
                <p class="text-sm text-gray-500 mb-4 italic">Bandar Lampung (Peta Lokasi)</p>
                <button class="w-full bg-green-500 text-white py-3 rounded-xl font-black text-xs uppercase shadow-md">Selesai Antar</button>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<p class="text-center text-gray-400 py-10">Tidak ada kiriman aktif.</p>';
    }
}
loadTasks();