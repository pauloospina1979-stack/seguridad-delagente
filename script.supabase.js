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
els.btnTheme?.addEventListener('click', toggleTheme);

// =====================
// 3) NAV
// =====================
function showTab(id) {
  if (els.tabDash) els.tabDash.classList.add('hidden');
  if (els.tabCheck) els.tabCheck.classList.add('hidden');
  if (id === 'tab-dashboard' && els.tabDash) els.tabDash.classList.remove('hidden');
  if (id === 'tab-checklist' && els.tabCheck) els.tabCheck.classList.remove('hidden');
}
els.btnDashTop?.addEventListener('click', () => showTab('tab-dashboard'));
els.btnCheckTop?.addEventListener('click', () => showTab('tab-checklist'));

// =====================
// 4) AUTH
// =====================
async function refreshUserUI() {
  const { data } = await sb.auth.getUser();
  currentUser = data?.user ?? null;
  if (currentUser) {
    if (els.btnLogin) els.btnLogin.style.display = 'none';
    if (els.btnLogout) els.btnLogout.style.display = '';
  } else {
    if (els.btnLogin) els.btnLogin.style.display = '';
    if (els.btnLogout) els.btnLogout.style.display = 'none';
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
    if (!email) { msg.textContent = 'Ingresa un correo válido.'; return; }
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
els.btnLogin?.addEventListener('click', openLoginModal);
els.btnLogout?.addEventListener('click', async () => {
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
  if (error) { console.error('rpc_category_progress error', error); return []; }
  return data || [];
}

async function fetchGlobalProgress() {
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_global_progress', { p_user_id: uid });
  if (error) { console.error('rpc_global_progress error', error); return { total_done: 0, total_items: 0, percent: 0 }; }
  const row = Array.isArray(data) ? data[0] : data;
  return row || { total_done: 0, total_items: 0, percent: 0 };
}

// Trae filas desde la vista v2 (incluye orden y puede incluir descripciones)
async function fetchChecklistRows() {
  const uid = await getActiveUserId();

  let { data, error } = await sb
    .from('items_by_category_v2')
    .select('*')
    .or(`user_id.eq.${uid},user_id.is.null`)
    .order('category_order', { ascending: true })
    .order('item_order', { ascending: true });

  if (error) {
    console.warn('items_by_category_v2 fallback:', error.message);
    const res2 = await sb
      .from('items_by_category_v2')
      .select('*')
      .or(`user_id.eq.${uid},user_id.is.null`);
    data = res2.data || [];
  }

  // Si la vista aún no trae category_description, lo rellenamos desde categories
  if (data && data.length && !('category_description' in data[0])) {
    const { data: cats } = await sb.from('categories').select('id,description');
    const mapCat = new Map((cats || []).map(c => [String(c.id), c.description]));
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
  if (!barChart && els.barCanvas) {
    barChart = new Chart(els.barCanvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Avance (%)', data: [], borderRadius: 8, backgroundColor: [] }] },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, max: 100, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text') } },
          y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text') } }
        }
      }
    });
  }
  if (!radarChart && els.radarCanvas) {
    radarChart = new Chart(els.radarCanvas, {
      type: 'radar',
      data: { labels: [], datasets: [{
        label: 'Avance %', data: [], fill: true,
        backgroundColor: 'rgba(16,185,129,.20)', borderColor: '#10b981', pointBackgroundColor: '#10b981'
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
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
  if (barChart) {
    barChart.data.labels = labels;
    barChart.data.datasets[0].data = values;
    barChart.data.datasets[0].backgroundColor = colors;
    barChart.update();
  }
  if (radarChart) {
    radarChart.data.labels = labels;
    radarChart.data.datasets[0].data = values;
    radarChart.update();
  }
}
function renderGlobal(s) {
  const pct = Math.round(s?.percent ?? 0);
  if (els.globalBar) els.globalBar.style.width = `${pct}%`;
  if (els.globalPct) els.globalPct.textContent = `${pct}%`;
  if (els.globalCount) els.globalCount.textContent = s?.total_done ?? 0;
  if (els.globalTotal) els.globalTotal.textContent = s?.total_items ?? 0;
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
  if (els.kpiEssential) els.kpiEssential.textContent = pc(agg.essential) + '%';
  if (els.kpiOptional)  els.kpiOptional.textContent  = pc(agg.optional)  + '%';
  if (els.kpiAdvanced)  els.kpiAdvanced.textContent  = pc(agg.advanced)  + '%';
}

function sortChecklistRows(rows){
  return (rows || []).slice().sort((a, b) => {
    const ca = Number(a.category_order ?? 9999);
    const cb = Number(b.category_order ?? 9999);
    if (ca !== cb) return ca - cb;
    const ia = Number(a.item_order ?? 9999);
    const ib = Number(b.item_order ?? 9999);
    return ia - ib;
  });
}

// =====================
// 7) CHECKLIST (con descripción)
// =====================
function renderChecklist(rows){
  // Agrupar por categoría
  const byCat = new Map();
  for (const r of rows) {
    const key = r.category_slug || r.category_id || r.category_name || 'categoria';
    if (!byCat.has(key)) {
      byCat.set(key, {
        name: r.category_name || String(key),
        items: []
      });
    }
    byCat.get(key).items.push(r);
  }

  const root = els.checklistContainer;
  if (!root) return;
  root.innerHTML = '';

  if (byCat.size === 0){
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No hay datos de checklist disponibles (verifica la vista "items_by_category_v2" y sus permisos RLS).';
    root.appendChild(empty);
    return;
  }

  for (const [slug, bucket] of byCat.entries()){
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.id = `cat-${slug}`;

    const head = document.createElement('div');
    head.className = 'catHead';

    const title = document.createElement('h4');
    title.textContent = bucket.name;
    title.style.margin = '0';

    const chip = document.createElement('div');
    chip.className = 'chip';
    let doneCount = bucket.items.filter(i => i.done).length;
    chip.textContent = `${doneCount}/${bucket.items.length} hechos`;

    head.appendChild(title);
    head.appendChild(chip);
    wrap.appendChild(head);

    const list = document.createElement('div');
    list.className = 'list';

    for (const it of bucket.items){
      const row = document.createElement('label');
      row.className = 'item';

      // 1) Checkbox
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.done;

      cb.addEventListener('change', async ()=>{
        const beforeChecked = cb.checked;
        try{
          await upsertProgress(it.item_id, beforeChecked);
          // refrescar dashboard
          await loadDashboard();
          // recalcular contadores visualmente
          doneCount = bucket.items.filter(i => i.item_id === it.item_id ? beforeChecked : i.done).length;
          chip.textContent = `${doneCount}/${bucket.items.length} hechos`;
        }catch(e){
          console.error(e);
          cb.checked = !beforeChecked; // revertir
        }
      });

      // 2) Contenedor de texto
      const textWrap = document.createElement('div');
      textWrap.className = 'itemText';

      // 2.1 Título del ítem
      const spanTitle = document.createElement('span');
      spanTitle.className = 'itemTitle';
      spanTitle.textContent = it.item_label || it.title || `Ítem ${it.item_id}`;

      // 2.2 ETIQUETA de nivel
      const level = (it.item_level || it.level || it.difficulty || '').toString().toLowerCase();
      const badge = document.createElement('span');
      badge.className = `badge ${level || 'neutral'}`;
      badge.textContent = level || 'nivel';

      // 2.3 DESCRIPCIÓN
      const descText =
        it.item_description ??
        it.description ??
        it.item_detail ??
        it.details ?? '';

      if (descText && String(descText).trim() !== '') {
        const descEl = document.createElement('div');
        descEl.className = 'itemDesc';
        descEl.textContent = String(descText).trim();
        textWrap.appendChild(descEl);
      }

      // ensamblar
      textWrap.prepend(badge);
      textWrap.prepend(spanTitle);
      row.appendChild(cb);
      row.appendChild(textWrap);
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
  const [cats, global, rows] = await Promise.all([
    fetchCategoryProgress(),
    fetchGlobalProgress(),
    fetchChecklistRows()
  ]);
  renderCategoryCharts(cats);
  renderGlobal(global);
  renderLevelKPIs(rows);
}

async function loadChecklist(){
  try{
    const rows = await fetchChecklistRows();     // <<-- ¡aquí estaba el error!
    const sorted = sortChecklistRows(rows);
    renderChecklist(sorted);
  }catch(e){
    console.error('Error cargando checklist', e);
    if (els.checklistContainer) {
      els.checklistContainer.innerHTML = `<div class="muted">Error al cargar checklist: ${e.message||e}</div>`;
    }
  }
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
