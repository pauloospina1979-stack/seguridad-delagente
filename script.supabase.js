// =====================
// 1) CONFIG SUPABASE
// =====================
const SUPABASE_URL = "https://piqobvnfkglhwkhqzvpe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";
const FALLBACK_USER_ID = "6abafec6-cf31-47a0-96e8-18b3cb08c0f0";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// helpers
const $ = (sel, el = document) => el.querySelector(sel);
const $all = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const els = {
  // botones
  btnTheme: $('#btnTheme'),
  btnDashTop: $('#btnDashTop'),
  btnCheckTop: $('#btnCheckTop'),
  btnLogin: $('#btnLogin'),
  btnLogout: $('#btnLogout'),

  // tabs
  tabDash: $('#tab-dashboard'),
  tabCheck: $('#tab-checklist'),

  // charts & global
  barCanvas: $('#barChart'),
  radarCanvas: $('#radarChart'),
  globalBar: $('#globalBar'),
  globalPct: $('#globalPct'),
  globalCount: $('#globalCount'),
  globalTotal: $('#globalTotal'),

  // KPIs por nivel (círculos grandes a la izquierda)
  kpiEssential: $('#kpiEssential'),
  kpiOptional:  $('#kpiOptional'),
  kpiAdvanced:  $('#kpiAdvanced'),

  // checklist
  checklistContainer: $('#checklistContainer'),
};

let barChart, radarChart;
let currentUser = null;

// =====================
// 2) TEMA (botón 🌙/☀️ y fallback a #btnTheme)
// =====================
(function initTheme(){
  const root = document.documentElement;
  const toggleA = document.getElementById('themeToggle'); // si existe
  const saved = localStorage.getItem('theme') || 'light';
  root.setAttribute('data-theme', saved);
  if (toggleA) toggleA.textContent = saved === 'dark' ? '☀️' : '🌙';

  const handler = () => {
    const cur = root.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    if (toggleA) toggleA.textContent = next === 'dark' ? '☀️' : '🌙';
  };

  toggleA?.addEventListener('click', handler);
  els.btnTheme?.addEventListener('click', handler);
})();

// =====================
// 3) NAV / TABS
// =====================
function showTab(id){
  [els.tabDash, els.tabCheck].forEach(x => x && x.classList.add('hidden'));
  $all('.tabbtn').forEach(b => b.classList.remove('active'));
  const t = $('#' + id);
  if (t) t.classList.remove('hidden');
  const btn = $(`.tabbtn[data-tab="${id}"]`);
  btn?.classList.add('active');
}
$all('.tabbtn').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
els.btnDashTop?.addEventListener('click', () => showTab('tab-dashboard'));
els.btnCheckTop?.addEventListener('click', () => showTab('tab-checklist'));

// =====================
// 4) AUTH
// =====================
async function refreshUserUI(){
  const { data } = await sb.auth.getUser();
  currentUser = data?.user ?? null;
  if (currentUser){
    els.btnLogin?.classList.add('hidden');
    els.btnLogout?.classList.remove('hidden');
  }else{
    els.btnLogin?.classList.remove('hidden');
    els.btnLogout?.classList.add('hidden');
  }
}
els.btnLogout?.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  await refreshUserUI();
  await loadAll();
});
els.btnLogin?.addEventListener('click', ()=>{
  alert('Para iniciar sesión, usa el enlace mágico configurado en Supabase.');
});

async function getActiveUserId(){
  const { data } = await sb.auth.getUser();
  return data?.user?.id || FALLBACK_USER_ID;
}

// =====================
// 5) DATA / RPC
// =====================
async function fetchCategoryProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_category_progress', { user_id: uid });
  if (error){ console.warn('rpc_category_progress error', error); return []; }
  return data || [];
}

async function fetchGlobalProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_global_progress', { p_user_id: uid });
  if (error){
    console.warn('rpc_global_progress error', error);
    return { percent:0, total_done:0, total_items:0 };
  }
  // Puede venir como array con 1 fila
  const row = Array.isArray(data) ? data[0] : data;
  return row || { percent:0, total_done:0, total_items:0 };
}

// Si tienes rpc_progress_by_level → úsala; si no, cómputo local.
async function fetchProgressByLevel(){
  const uid = await getActiveUserId();

  // 1) intento por RPC
  const tryRpc = await sb.rpc('rpc_progress_by_level', { p_user_id: uid });
  if (!tryRpc.error && tryRpc.data){
    return tryRpc.data; // [{level:'essential', percent:..}, ...]
  }

  // 2) fallback local (items + progress)
  const { data, error } = await sb
    .from('items')
    .select('id,difficulty,progress:progress!left(user_id,completed)')
  if (error){ console.warn('fallback progress_by_level error', error); return []; }

  const agg = { essential:{done:0,total:0}, optional:{done:0,total:0}, advanced:{done:0,total:0} };
  for(const it of data){
    const lvl = (it.difficulty || 'essential').toLowerCase();
    if (!agg[lvl]) continue;
    agg[lvl].total++;
    const isDone = it.progress?.some?.(p => p.user_id === uid && p.completed) ? 1 : 0;
    agg[lvl].done += isDone;
  }
  return Object.entries(agg).map(([k,v]) => ({
    level: k,
    percent: v.total ? Math.round(v.done * 100 / v.total) : 0
  }));
}

// Vista con descripción (en tu BD la columna es item_description)
async function fetchChecklistData(){
  const uid = await getActiveUserId();

  let { data, error } = await sb
    .from('items_by_category_v2')
    .select('category_id,category_slug,category_name,category_order,item_id,item_label,item_description,item_level,item_order,done,user_id')
    .eq('user_id', uid)
    .order('category_order', { ascending:true })
    .order('item_order', { ascending:true });

  if (error){
    console.warn('items_by_category_v2 no disponible; usando fallback items_by_category. Detalle:', error.message);
    const fb = await sb
      .from('items_by_category')
      .select('*')
      .eq('user_id', uid)
      .order('category_order', { ascending:true })
      .order('item_order', { ascending:true });
    if (fb.error){ console.warn('fallback items_by_category error', fb.error); return []; }
    data = fb.data || [];
  }
  return data || [];
}

async function upsertProgress(itemId, completed){
  const uid = await getActiveUserId();
  const { error } = await sb.rpc('rpc_upsert_progress', {
    p_user_id: uid,
    p_item_id: itemId,
    p_completed: !!completed
  });
  if (error) console.error('rpc_upsert_progress error', error);
}

// =====================
// 6) CHARTS
// =====================
function ensureCharts(){
  if (!barChart && els.barCanvas){
    barChart = new Chart(els.barCanvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label:'Avance', data:[], borderRadius:6, backgroundColor:'#27c093' }]},
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend:{ display:false }, tooltip:{ enabled:true } },
        scales: {
          x: { beginAtZero:true, max:100, ticks:{ color:'var(--text)' } },
          y: { ticks:{ color:'var(--text)' } }
        }
      }
    });
  }
  if (!radarChart && els.radarCanvas){
    radarChart = new Chart(els.radarCanvas, {
      type: 'radar',
      data: { labels: [], datasets: [{ label:'Avance %', data:[], fill:true, backgroundColor:'rgba(39,192,147,.25)', borderColor:'#27c093', pointBackgroundColor:'#27c093' }]},
      options: {
        responsive: true,
        scales: { r:{ angleLines:{color:'var(--border)'}, grid:{color:'var(--border)'}, pointLabels:{color:'var(--text)'}, ticks:{display:false, max:100} } },
        plugins: { legend:{ display:false } }
      }
    });
  }
}

function renderCategoryCharts(rows){
  const labels = rows.map(r => r.label ?? r.category ?? 'Cat');
  const values = rows.map(r => Math.round(r.percent ?? 0));

  ensureCharts();

  if (barChart){
    barChart.data.labels = labels;
    barChart.data.datasets[0].data = values;
    barChart.update();

    els.barCanvas.onclick = (evt)=>{
      const points = barChart.getElementsAtEventForMode(evt,'nearest',{intersect:true},true);
      if(!points?.length) return;
      const idx = points[0].index;
      const slug = (rows[idx].category_slug || '').toString();
      showTab('tab-checklist');
      if (slug){
        const target = document.getElementById(`cat-${slug}`);
        target?.scrollIntoView({ behavior:'smooth', block:'start' });
      }
    };
  }

  if (radarChart){
    radarChart.data.labels = labels;
    radarChart.data.datasets[0].data = values;
    radarChart.update();
  }
}

function renderGlobalSummary(s){
  const pct = Math.round(s?.percent ?? 0);
  const done = s?.total_done ?? 0;
  const total = s?.total_items ?? 0;
  els.globalBar && (els.globalBar.style.width = `${pct}%`);
  els.globalPct && (els.globalPct.textContent = `${pct}%`);
  els.globalCount && (els.globalCount.textContent = done);
  els.globalTotal && (els.globalTotal.textContent = total);
}

function renderProgressLevels(rows){
  const by = { essential:0, optional:0, advanced:0 };
  (rows || []).forEach(r=>{
    const key = String(r.level || '').toLowerCase();
    if (key in by) by[key] = Number(r.percent) || 0;
  });
  const setPct = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = `${Math.round(v)}%`; };
  setPct('prog-essential', by.essential);
  setPct('prog-optional',  by.optional);
  setPct('prog-advanced',  by.advanced);

  // Si usas los “cards” grandes de la izquierda:
  els.kpiEssential && (els.kpiEssential.textContent = `${by.essential}%`);
  els.kpiOptional  && (els.kpiOptional.textContent  = `${by.optional}%`);
  els.kpiAdvanced  && (els.kpiAdvanced.textContent  = `${by.advanced}%`);
}

// =====================
// 7) RENDER CHECKLIST (título + pill + descripción)
// =====================
function levelPill(level){
  const lv = (level || 'essential').toLowerCase();
  const pill = document.createElement('span');
  pill.className = `pill ${lv}`;
  pill.textContent = lv;
  return pill;
}

function renderChecklist(rows){
  // Agrupar por categoría
  const byCat = new Map();
  for (const r of rows){
    const slug = r.category_slug || r.category_id || 'cat';
    if (!byCat.has(slug)){
      byCat.set(slug, { name: r.category_name || String(slug), items: [] });
    }
    byCat.get(slug).items.push(r);
  }

  const root = els.checklistContainer;
  if (!root) return;
  root.innerHTML = '';

  if (byCat.size === 0){
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No hay datos de checklist (verifica la vista items_by_category_v2 y permisos RLS).';
    root.appendChild(empty);
    return;
  }

  // Construir cada categoría
  for (const [slug, bucket] of byCat.entries()){
    const wrap = document.createElement('section');
    wrap.className = 'catCard';
    wrap.id = `cat-${slug}`;

    // Encabezado
    const head = document.createElement('div');
    head.className = 'catHead';

    const h3 = document.createElement('h3');
    h3.className = 'catTitle';
    h3.textContent = bucket.name;

    const chip = document.createElement('div');
    chip.className = 'chip';
    let doneCount = bucket.items.filter(i => i.done).length;
    chip.textContent = `${doneCount}/${bucket.items.length} hechos`;

    head.appendChild(h3);
    head.appendChild(chip);
    wrap.appendChild(head);

    // Lista
    const list = document.createElement('div');
    list.className = 'list';

    for (const it of bucket.items){
      const row = document.createElement('div');
      row.className = 'itemRow';

      // checkbox
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.done;

      // contenido
      const right = document.createElement('div');
      right.className = 'itemRight';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'titleWrap';
      // aseguro separación si faltase CSS
      titleWrap.style.display = 'flex';
      titleWrap.style.alignItems = 'center';
      titleWrap.style.gap = '8px';

      const titleEl = document.createElement('strong'); // evita colisión con 'title'
      titleEl.className = 'itemTitle';
      titleEl.textContent = it.item_label || `Ítem ${it.item_id}`;

      const pill = levelPill(it.item_level);

      titleWrap.appendChild(titleEl);
      titleWrap.appendChild(pill);

      const p = document.createElement('p');
      p.className = 'itemDesc';
      p.textContent = it.item_description ?? it.item_detail ?? '';

      right.appendChild(titleWrap);
      right.appendChild(p);

      row.appendChild(cb);
      row.appendChild(right);
      list.appendChild(row);

      cb.addEventListener('change', async ()=>{
        try{
          await upsertProgress(it.item_id, cb.checked);
          // Actualiza contador de la categoría
          doneCount += cb.checked ? 1 : -1;
          chip.textContent = `${doneCount}/${bucket.items.length} hechos`;
          // refresca dashboard (gráficas, global y KPIs)
          await loadDashboard();
        }catch(e){
          console.error(e);
          cb.checked = !cb.checked; // revertir
        }
      });
    }

    wrap.appendChild(list);
    root.appendChild(wrap);
  }
}

// =====================
// 8) LOADERS
// =====================
async function loadDashboard(){
  try{
    const [catRows, global, lvlRows] = await Promise.all([
      fetchCategoryProgress().catch(() => []),
      fetchGlobalProgress().catch(() => ({ percent:0, total_done:0, total_items:0 })),
      fetchProgressByLevel().catch(() => ([
        { level:'essential', percent:0 },
        { level:'optional',  percent:0 },
        { level:'advanced',  percent:0 },
      ])),
    ]);

    renderCategoryCharts(catRows);
    renderGlobalSummary(global);
    renderProgressLevels(lvlRows);

  }catch(e){
    console.error('Error cargando dashboard', e);
  }
}

async function loadChecklist(){
  try{
    const rows = await fetchChecklistData();
    renderChecklist(rows);
  }catch(e){
    console.error('Error cargando checklist', e);
    if (els.checklistContainer){
      els.checklistContainer.innerHTML = `<div class="muted">Error al cargar checklist: ${e.message || e}</div>`;
    }
  }
}

async function loadAll(){
  await refreshUserUI();
  await loadDashboard();
  await loadChecklist();
}

// =====================
// 9) START
// =====================
console.log('Iniciando app…');
loadAll();
