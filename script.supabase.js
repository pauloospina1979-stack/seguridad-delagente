// =====================
// 1) CONFIG SUPABASE
// =====================
// ⬇️ Deja estos valores como los tienes actualmente
const SUPABASE_URL = "https://piqobvnfkglhwkhqzvpe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";
const FALLBACK_USER_ID = "6abafec6-cf31-47a0-96e8-18b3cb08c0f0";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// helpers
const $ = (sel, el=document) => el.querySelector(sel);
const $all = (sel, el=document) => Array.from(el.querySelectorAll(sel));

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

  // KPIs por nivel
  kpiEssential: $('#kpiEssential'),
  kpiOptional:  $('#kpiOptional'),
  kpiAdvanced:  $('#kpiAdvanced'),

  checklistContainer: $('#checklistContainer'),
};

let barChart, radarChart;
let currentUser = null;

// =====================
// THEME TOGGLE (🌙 / ☀️)
// =====================
const themeToggle = document.getElementById('themeToggle');
const root = document.documentElement;

// Cargar tema guardado
const savedTheme = localStorage.getItem('theme') || 'light';
root.setAttribute('data-theme', savedTheme);
themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

// Evento click
themeToggle.addEventListener('click', () => {
  const current = root.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
});

// =====================
// 2) THEME
// =====================
function toggleTheme(){
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme') || 'light';
  root.setAttribute('data-theme', cur === 'light' ? 'dark' : 'light');
}
if (els.btnTheme) els.btnTheme.addEventListener('click', toggleTheme);

// =====================
// 3) NAV / TABS
// =====================
function showTab(id){
  [els.tabDash, els.tabCheck].forEach(x => x && x.classList.add('hidden'));
  $all('.tabbtn').forEach(b=>b.classList.remove('active'));
  const t = $('#'+id);
  if (t) t.classList.remove('hidden');
  const activator = $(`.tabbtn[data-tab="${id}"]`);
  if (activator) activator.classList.add('active');
}
$all('.tabbtn').forEach(btn=>{
  btn.addEventListener('click', ()=> showTab(btn.dataset.tab));
});
if (els.btnDashTop) els.btnDashTop.addEventListener('click', ()=>showTab('tab-dashboard'));
if (els.btnCheckTop) els.btnCheckTop.addEventListener('click', ()=>showTab('tab-checklist'));

// =====================
// 4) AUTH
// =====================
async function refreshUserUI(){
  const { data } = await sb.auth.getUser();
  currentUser = data?.user ?? null;
  if (currentUser){
    els.btnLogin?.classList.add('hidden');
    els.btnLogout?.classList.remove('hidden');
  } else {
    els.btnLogin?.classList.remove('hidden');
    els.btnLogout?.classList.add('hidden');
  }
}
if (els.btnLogout){
  els.btnLogout.addEventListener('click', async ()=>{
    await sb.auth.signOut();
    await refreshUserUI();
    await loadAll();
  });
}
if (els.btnLogin){
  els.btnLogin.addEventListener('click', ()=>{
    alert('Para iniciar sesión, usa el enlace mágico de Supabase (ya configurado).');
  });
}

async function getActiveUserId(){
  const { data } = await sb.auth.getUser();
  return data?.user?.id || FALLBACK_USER_ID;
}

// =====================
// 5) RPCs / DATA
// =====================
async function fetchCategoryProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_category_progress', { user_id: uid });
  if (error) { console.warn('rpc_category_progress error', error); return []; }
  return data || [];
}

async function fetchGlobalProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_global_progress', { 
    p_user_id: uid   // 👈 nombre correcto del parámetro
  });
  if (error) { 
    console.warn('rpc_global_progress error', error); 
    return { percent:0, total_done:0, total_items:0 }; 
  }
  return data || { percent:0, total_done:0, total_items:0 };
}

async function fetchKPIsByLevel(){
  // KPIs por nivel (essential/optional/advanced) desde items + progress
  const uid = await getActiveUserId();
  const { data, error } = await sb
    .from('items')
    .select('difficulty, id, progress:progress!left(user_id, completed)')
  if (error){ console.warn('kpis error', error); return { essential:{pct:0}, optional:{pct:0}, advanced:{pct:0} }; }

  const by = { essential:{done:0,total:0}, optional:{done:0,total:0}, advanced:{done:0,total:0} };
  for(const row of data){
    const level = (row.difficulty || 'essential').toLowerCase();
    if (!by[level]) continue;
    by[level].total++;
    const isDone = row.progress?.find?.(p => p.user_id === uid && p.completed) ? 1 : 0;
    by[level].done += isDone;
  }
  const out = {};
  for(const k of Object.keys(by)){
    const t = by[k].total || 0, d = by[k].done || 0;
    out[k] = { pct: t? Math.round(d*100/t):0, done:d, total:t };
  }
  return out;
}

// Leer checklist agrupado por categoría.
// IMPORTANTE: en tu BD la vista usa "item_description", no "item_detail".
async function fetchChecklistData(){
  const uid = await getActiveUserId();

  // Intentamos la nueva vista con descripción
  let { data, error } = await sb
    .from('items_by_category_v2')
    .select('category_id,category_slug,category_name,category_order,item_id,item_label,item_description,item_level,item_order,done,user_id')
    .eq('user_id', uid)
    .order('category_order', { ascending:true })
    .order('item_order', { ascending:true });

  if (error){
    console.warn('items_by_category_v2 no disponible; usando fallback a items_by_category. Motivo:', error.message);
    // Fallback sin descripción
    const fb = await sb
      .from('items_by_category')
      .select('*')
      .eq('user_id', uid)
      .order('category_order', {ascending:true})
      .order('item_order', {ascending:true});
    if (fb.error){ console.warn('fallback también falló', fb.error); return []; }
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
      data: { labels: [], datasets: [{ label:'Avance', data:[], borderRadius:6, backgroundColor:'#27c093' } ]},
      options: {
        indexAxis: 'y',
        responsive:true,
        plugins:{ legend:{ display:false }, tooltip:{enabled:true}},
        scales:{ x:{ beginAtZero:true, max:100, ticks:{color:'var(--text)'}}, y:{ ticks:{color:'var(--text)'}} }
      }
    });
  }
  if (!radarChart && els.radarCanvas){
    radarChart = new Chart(els.radarCanvas, {
      type: 'radar',
      data: { labels: [], datasets:[{ label:'Avance %', data:[], fill:true, backgroundColor:'rgba(39,192,147,.25)', borderColor:'#27c093', pointBackgroundColor:'#27c093'}]},
      options: {
        responsive:true,
        scales:{ r:{ angleLines:{color:'var(--border)'}, grid:{color:'var(--border)'}, pointLabels:{color:'var(--text)'}, ticks:{display:false, max:100} } },
        plugins:{ legend:{ display:false }}
      }
    });
  }
}

function renderCategoryCharts(rows){
  const labels = rows.map(r=> r.label ?? r.category ?? 'Cat');
  const values = rows.map(r=> Math.round(r.percent ?? 0));
  ensureCharts();
  if (barChart){
    barChart.data.labels = labels;
    barChart.data.datasets[0].data = values;
    barChart.update();
    els.barCanvas.onclick = (evt)=>{
      const points = barChart.getElementsAtEventForMode(evt,'nearest',{intersect:true},true);
      if(!points?.length) return;
      const idx = points[0].index;
      const catSlug = (rows[idx].category_slug || '').toString();
      showTab('tab-checklist');
      if (catSlug){
        const target = document.getElementById(`cat-${catSlug}`);
        target?.scrollIntoView({behavior:'smooth', block:'start'});
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
  if (els.globalBar) els.globalBar.style.width = `${pct}%`;
  els.globalPct && (els.globalPct.textContent = `${pct}%`);
  els.globalCount && (els.globalCount.textContent = done);
  els.globalTotal && (els.globalTotal.textContent = total);
}

function renderKPIs(kpis){
  if (els.kpiEssential) els.kpiEssential.textContent = `${kpis.essential.pct}%`;
  if (els.kpiOptional)  els.kpiOptional.textContent  = `${kpis.optional.pct}%`;
  if (els.kpiAdvanced)  els.kpiAdvanced.textContent  = `${kpis.advanced.pct}%`;
}

// =====================
// 7) RENDER CHECKLIST (con descripción)
// =====================
function levelPill(level){
  const lv = (level || 'essential').toLowerCase();
  const map = { essential:'var(--pill-essential)', optional:'var(--pill-optional)', advanced:'var(--pill-advanced)' };
  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.classList.add(lv);   // 👈 aplica .pill.essential / .pill.optional / .pill.advanced
  pill.textContent = lv;
  pill.style.background = map[lv] || 'var(--pill-essential)';
  return pill;
}

function renderChecklist(rows){
  const byCat = new Map();
  for(const r of rows){
    const slug = r.category_slug || r.category_id || 'categoria';
    if (!byCat.has(slug)){
      byCat.set(slug, {
        name: r.category_name || String(slug),
        items: [],
      });
    }
    byCat.get(slug).items.push(r);
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
    const wrap = document.createElement('section');
    wrap.className = 'catCard';

    const head = document.createElement('div');
    head.className = 'catHead';
    const h3 = document.createElement('h3');
    h3.textContent = bucket.name;
    const chip = document.createElement('div');
    chip.className = 'chip';
    const doneCount = bucket.items.filter(i=>i.done).length;
    chip.textContent = `${doneCount}/${bucket.items.length} hechos`;
    head.appendChild(h3);
    head.appendChild(chip);
    wrap.appendChild(head);

    const list = document.createElement('div');
    list.className = 'list';

    for (const it of bucket.items){
      const row = document.createElement('div');
      row.className = 'itemRow';

      const left = document.createElement('div');
      left.className = 'itemLeft';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.done;
      cb.addEventListener('change', async ()=>{
        try{
          await upsertProgress(it.item_id, cb.checked);
          // refrescar chips y dashboard
          await loadDashboard();
          const newDone = (cb.checked ? doneCount+1 : doneCount-1);
          chip.textContent = `${newDone}/${bucket.items.length} hechos`;
        }catch(e){
          console.error(e);
          cb.checked = !cb.checked;
        }
      });
      left.appendChild(cb);

      const right = document.createElement('div');
      right.className = 'itemRight';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'titleWrap';

      const title = document.createElement('strong');
      title.textContent = it.item_label || `Ítem ${it.item_id}`;
      titleWrap.appendChild(title);

      titleWrap.appendChild(levelPill(it.item_level));

      const p = document.createElement('p');
      // 👇 Aceptamos item_description (tu vista) y también item_detail (por compatibilidad)
      const desc = it.item_description ?? it.item_detail ?? '';
      p.textContent = desc;

      right.appendChild(titleWrap);
      right.appendChild(p);

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    }

    wrap.id = `cat-${slug}`;
    wrap.appendChild(list);
    root.appendChild(wrap);
  }
}

// =====================
// 8) LOADERS
// =====================
async function loadDashboard(){
  try{
    const [catRows, global, kpis] = await Promise.all([
      fetchCategoryProgress().catch(_=>[]),
      fetchGlobalProgress().catch(_=>({percent:0,total_done:0,total_items:0})),
      fetchKPIsByLevel().catch(_=>({ essential:{pct:0}, optional:{pct:0}, advanced:{pct:0} }))
    ]);
    renderCategoryCharts(catRows);
    renderGlobalSummary(global);
    renderKPIs(kpis);
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
    els.checklistContainer.innerHTML = `<div class="muted">Error al cargar checklist: ${e.message||e}</div>`;
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
