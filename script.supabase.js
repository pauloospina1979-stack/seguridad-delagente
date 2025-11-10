// =====================
// 1) CONFIG SUPABASE
// =====================
const SUPABASE_URL = "https://piqobvnfkglhwkhqzvpe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";
const FALLBACK_USER_ID = "6abafec6-cf31-47a0-96e8-18b3cb08c0f0";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const $ = (s, el = document) => el.querySelector(s);

// Elementos
const els = {
  btnTheme: $('#btnTheme'),
  btnDashTop: $('#btnDashTop'),
  btnCheckTop: $('#btnCheckTop'),
  btnLogin: $('#btnLogin'),
  btnLogout: $('#btnLogout'),
  tabDash: $('#tab-dashboard'),
  tabCheck: $('#tab-checklist'),
  barCanvas: $('#barChart'),
  radarCanvas: $('#radarChart'),
  globalBar: $('#globalBar'),
  globalPct: $('#globalPct'),
  globalCount: $('#globalCount'),
  globalTotal: $('#globalTotal'),
  kpiEssential: $('#kpiEssential'),
  kpiOptional: $('#kpiOptional'),
  kpiAdvanced: $('#kpiAdvanced'),
  checklistContainer: $('#checklistContainer'),
};

let barChart, radarChart;
let currentUser = null;

// =====================
// 2) THEME TOGGLE
// =====================
function toggleTheme() {
  const root = document.body;
  const cur = root.getAttribute('data-theme') || 'light';
  root.setAttribute('data-theme', cur === 'light' ? 'dark' : 'light');
}
els.btnTheme.addEventListener('click', toggleTheme);

// =====================
// 3) NAV
// =====================
function showTab(id) {
  els.tabDash.classList.add('hidden');
  els.tabCheck.classList.add('hidden');
  if (id === 'tab-dashboard') els.tabDash.classList.remove('hidden');
  if (id === 'tab-checklist') els.tabCheck.classList.remove('hidden');
}
els.btnDashTop.addEventListener('click', () => showTab('tab-dashboard'));
els.btnCheckTop.addEventListener('click', () => showTab('tab-checklist'));

// =====================
// 4) AUTH
// =====================
async function refreshUserUI() {
  const { data } = await sb.auth.getUser();
  currentUser = data?.user ?? null;
  if (currentUser) {
    els.btnLogin.style.display = 'none';
    els.btnLogout.style.display = '';
  } else {
    els.btnLogin.style.display = '';
    els.btnLogout.style.display = 'none';
  }
}

function openLoginModal() {
  const host = document.body.appendChild(document.createElement('div'));
  host.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);z-index:50';
  const frag = document.importNode(document.querySelector('#tplLogin').content, true);
  host.appendChild(frag);
  document.querySelector('#closeLogin', host)?.addEventListener('click', () => host.remove());
  document.querySelector('#sendLink', host)?.addEventListener('click', async () => {
    const email = document.querySelector('#emailInput', host).value.trim();
    const msg = document.querySelector('#loginMsg', host);
    if (!email) {
      msg.textContent = 'Ingresa un correo válido.';
      return;
    }
    msg.textContent = 'Enviando enlace...';
    try {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      msg.textContent = 'Revisa tu correo y sigue el enlace para iniciar sesión.';
    } catch (e) {
      msg.textContent = 'Error: ' + (e.message || e);
    }
  });
}
els.btnLogin.addEventListener('click', openLoginModal);
els.btnLogout.addEventListener('click', async () => {
  await sb.auth.signOut();
  await refreshUserUI();
  await loadAll();
});

// =====================
// 5) DATA HELPERS
// =====================
async function getActiveUserId() {
  const { data } = await sb.auth.getUser();
  return data?.user?.id || FALLBACK_USER_ID;
}

async function fetchCategoryProgress() {
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_category_progress', { user_id: uid });
  if (error) {
    console.error('rpc_category_progress error', error);
    return [];
  }
  return data || [];
}

async function fetchGlobalProgress() {
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_global_progress', { p_user_id: uid });
  if (error) {
    console.error('rpc_global_progress error', error);
    return { total_done: 0, total_items: 0, percent: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row || { total_done: 0, total_items: 0, percent: 0 };
}

async function fetchChecklistRows() {
  const uid = await getActiveUserId();
  let { data, error } = await sb
    .from('items_by_category')
    .select('*')
    .or(`user_id.eq.${uid},user_id.is.null`)
    .order('category_order', { ascending: true })
    .order('item_order', { ascending: true });

  if (error) {
    console.warn('items_by_category fallback:', error.message);
    const res2 = await sb
      .from('items_by_category')
      .select('*')
      .or(`user_id.eq.${uid},user_id.is.null`);
    data = res2.data || [];
  }

  // 🔹 Si no trae la descripción, la completamos desde categories
  if (data && data.length && !('category_description' in data[0])) {
    const { data: cats } = await sb.from('categories').select('id,description');
    const mapCat = new Map(cats.map(c => [String(c.id), c.description]));
    data = data.map(r => ({
      ...r,
      category_description: r.category_description || mapCat.get(String(r.category_id)) || ''
    }));
  }

  return data || [];
}

async function upsertProgress(itemId, completed) {
  const uid = await getActiveUserId();
  const { error } = await sb.rpc('rpc_upsert_progress', {
    p_user_id: uid,
    p_item_id: itemId,
    p_completed: !!completed
  });
  if (error) console.error('upsert_progress error', error);
}

// =====================
// 6) CHARTS
// =====================
function colorFor(p) {
  if (p >= 80) return '#10b981';
  if (p >= 40) return '#f59e0b';
  return '#ef4444';
}
function ensureCharts() {
  if (!barChart) {
    barChart = new Chart(els.barCanvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Avance (%)', data: [], borderRadius: 8, backgroundColor: [] }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, max: 100, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text') } },
          y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text') } }
        }
      }
    });
  }
  if (!radarChart) {
    radarChart = new Chart(els.radarCanvas, {
      type: 'radar',
      data: {
        labels: [],
        datasets: [{
          label: 'Avance %',
          data: [],
          fill: true,
          backgroundColor: 'rgba(16,185,129,.20)',
          borderColor: '#10b981',
          pointBackgroundColor: '#10b981'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: getComputedStyle(document.body).getPropertyValue('--border') },
            grid: { color: getComputedStyle(document.body).getPropertyValue('--border') },
            pointLabels: { color: getComputedStyle(document.body).getPropertyValue('--text') },
            ticks: { display: false, max: 100 }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }
}
function renderCategoryCharts(rows) {
  const labels = rows.map(r => r.label ?? r.category ?? 'Cat');
  const values = rows.map(r => Math.round(r.percent ?? 0));
  const colors = values.map(colorFor);
  ensureCharts();
  barChart.data.labels = labels;
  barChart.data.datasets[0].data = values;
  barChart.data.datasets[0].backgroundColor = colors;
  barChart.update();
  radarChart.data.labels = labels;
  radarChart.data.datasets[0].data = values;
  radarChart.update();
}
function renderGlobal(s) {
  const pct = Math.round(s?.percent ?? 0);
  els.globalBar.style.width = `${pct}%`;
  els.globalPct.textContent = `${pct}%`;
  els.globalCount.textContent = s?.total_done ?? 0;
  els.globalTotal.textContent = s?.total_items ?? 0;
}
function renderLevelKPIs(rows) {
  const agg = { essential: { done: 0, total: 0 }, optional: { done: 0, total: 0 }, advanced: { done: 0, total: 0 } };
  for (const r of rows) {
    const lvl = (r.item_level || 'essential').toLowerCase();
    if (!agg[lvl]) continue;
    agg[lvl].total += 1;
    if (r.done) agg[lvl].done += 1;
  }
  const pc = o => o.total > 0 ? Math.round((o.done * 100) / o.total) : 0;
  els.kpiEssential.textContent = pc(agg.essential) + '%';
  els.kpiOptional.textContent = pc(agg.optional) + '%';
  els.kpiAdvanced.textContent = pc(agg.advanced) + '%';
}

// =====================
// 7) CHECKLIST (con descripción)
// =====================
function renderChecklist(rows) {
  const root = els.checklistContainer;
  root.innerHTML = '';
  const map = new Map();
  for (const r of rows) {
    const key = r.category_slug || r.category_id || r.category_name || 'cat';
    if (!map.has(key)) map.set(key, { slug: key, name: r.category_name || String(key), description: r.category_description || '', items: [] });
    map.get(key).items.push(r);
  }
  if (map.size === 0) {
    const d = document.createElement('div');
    d.className = 'muted';
    d.textContent = 'No hay datos de checklist disponibles (verifica la vista "items_by_category" y sus permisos RLS).';
    root.appendChild(d);
    return;
  }
  for (const [, bucket] of map.entries()) {
    const wrap = document.createElement('div');
    wrap.className = 'cat';
    wrap.id = `cat-${bucket.slug}`;
    const head = document.createElement('div');
    head.className = 'catHead';
    const title = document.createElement('h3');
    title.textContent = bucket.name;
    title.style.margin = '0';
    const chip = document.createElement('div');
    chip.className = 'chip';
    const done0 = bucket.items.filter(i => i.done).length;
    chip.textContent = `${done0}/${bucket.items.length} hechos`;
    head.appendChild(title);
    head.appendChild(chip);
    wrap.appendChild(head);

    // 🔹 Mostrar descripción
    if (bucket.description) {
      const desc = document.createElement('p');
      desc.className = 'muted';
      desc.style.margin = '-2px 0 10px 0';
      desc.textContent = bucket.description;
      wrap.appendChild(desc);
    }

    const list = document.createElement('div');
    list.className = 'list';
    for (const it of bucket.items) {
      const row = document.createElement('label');
      row.className = 'item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.done;
      cb.addEventListener('change', async () => {
        const before = !cb.checked;
        try {
          await upsertProgress(it.item_id, cb.checked);
          await loadDashboard();
          const newDone = cb.checked ? done0 + 1 : done0 - 1;
          chip.textContent = `${newDone}/${bucket.items.length} hechos`;
        } catch (e) {
          console.error(e);
          cb.checked = before;
        }
      });
      const span = document.createElement('span');
      span.textContent = it.item_label || `Ítem ${it.item_id}`;
      const lvl = document.createElement('span');
      lvl.textContent = (it.item_level || 'essential');
      lvl.className = 'pill';
      lvl.style.marginLeft = '10px';
      row.appendChild(cb);
      row.appendChild(span);
      row.appendChild(lvl);
      list.appendChild(row);
    }
    wrap.appendChild(list);
    root.appendChild(wrap);
  }
}

// =====================
// 8) LOADERS
// =====================
async function loadDashboard() {
  const [cats, global, rows] = await Promise.all([fetchCategoryProgress(), fetchGlobalProgress(), fetchChecklistRows()]);
  renderCategoryCharts(cats);
  renderGlobal(global);
  renderLevelKPIs(rows);
}
async function loadChecklist() {
  const rows = await fetchChecklistRows();
  renderChecklist(rows);
}
async function loadAll() {
  await refreshUserUI();
  await loadDashboard();
  await loadChecklist();
}

// =====================
// 9) START
// =====================
console.log('Iniciando app…');
showTab('tab-checklist');
loadAll();
