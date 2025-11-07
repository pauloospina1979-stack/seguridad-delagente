// =====================
// 1) CONFIG SUPABASE
// =====================
const SUPABASE_URL = "https://piqobvnfkglhwkhqzvpe.supabase.co";   // <-- Pega tu URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";                      // <-- Pega tu anon key
// UUID de usuario “anónimo” que creaste en tabla public.users
const FALLBACK_USER_ID = "6abafec6-cf31-47a0-96e8-18b3cb08c0f0";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
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

    tabBtns: $all('.tabbtn'),
    tabDash: $('#tab-dashboard'),
    tabCheck: $('#tab-checklist'),

    barCanvas: $('#barChart'),
    radarCanvas: $('#radarChart'),
    globalBar: $('#globalBar'),
    globalPct: $('#globalPct'),
    globalCount: $('#globalCount'),
    globalTotal: $('#globalTotal'),
    checklistContainer: $('#checklistContainer'),
};

let barChart, radarChart;
let currentUser = null;

// =====================
// 2) THEME TOGGLE
// =====================
function toggleTheme(){
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme') || 'dark';
  root.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
}
els.btnTheme.addEventListener('click', toggleTheme);

// =====================
// 3) NAV / TABS
// =====================
function showTab(id){
  [els.tabDash, els.tabCheck].forEach(x => x.classList.add('hidden'));
  $all('.tabbtn').forEach(b=>b.classList.remove('active'));
  $('#'+id).classList.remove('hidden');
  $(`.tabbtn[data-tab="${id}"]`).classList.add('active');
}
$all('.tabbtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    showTab(btn.dataset.tab);
  });
});
els.btnDashTop.addEventListener('click', ()=>showTab('tab-dashboard'));
els.btnCheckTop.addEventListener('click', ()=>showTab('tab-checklist'));

// =====================
// 4) AUTH (OTP POR EMAIL)
// =====================
async function refreshUserUI(){
  const { data } = await sb.auth.getUser();
  currentUser = data?.user ?? null;

  if (currentUser){
    els.btnLogin.classList.add('hidden');
    els.btnLogout.classList.remove('hidden');
  } else {
    els.btnLogin.classList.remove('hidden');
    els.btnLogout.classList.add('hidden');
  }
}

function openLoginModal(){
  const host = document.body.appendChild(document.createElement('div'));
  host.id = 'loginHost';
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.background = 'rgba(0,0,0,.55)';
  host.style.backdropFilter = 'blur(2px)';
  host.style.zIndex = 50;
  const frag = document.importNode($('#tplLogin').content, true);
  host.appendChild(frag);

  $('#closeLogin', host).onclick = ()=> host.remove();
  $('#sendLink', host).onclick = async ()=>{
    const email = $('#emailInput', host).value.trim();
    if(!email){ $('#loginMsg',host).textContent='Ingresa un correo válido.'; return; }
    $('#sendLink', host).disabled = true;
    $('#loginMsg',host).textContent='Enviando enlace...';
    try{
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      $('#loginMsg',host).textContent = 'Revisa tu correo y sigue el enlace para iniciar sesión.';
    }catch(e){
      $('#loginMsg',host).textContent = 'Error: ' + (e.message || e);
    }finally{
      $('#sendLink', host).disabled = false;
    }
  };
}
els.btnLogin.addEventListener('click', openLoginModal);
els.btnLogout.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  await refreshUserUI();
  // recargar datos para el usuario anónimo
  await loadAll();
});

// =====================
// 5) LLAMADAS RPC
//    rpc_category_progress(user_id UUID) -> rows: {category, label, percent, count_done, count_total}
//    rpc_global_progress(user_id UUID) -> { total_done, total_items, percent }
// =====================
async function getActiveUserId(){
  const { data } = await sb.auth.getUser();
  const uid = data?.user?.id || FALLBACK_USER_ID;
  return uid;
}

async function fetchCategoryProgress(){
  const uid = await getActiveUserId();
  console.log('Consultando progreso por categoría...');
  const { data, error } = await sb.rpc('rpc_category_progress', { user_id: uid });
  if (error){ console.error('rpc_category_progress error', error); throw error; }
  return data || [];
}

async function fetchGlobalProgress(){
  const uid = await getActiveUserId();
  console.log('Consultando progreso global...');
  const { data, error } = await sb.rpc('rpc_global_progress', { user_id: uid });
  if (error){ console.error('rpc_global_progress error', error); throw error; }
  return data; // { total_done, total_items, percent }
}

async function fetchChecklistData(){
  // Si creaste una vista `items_by_category` visible por anon key:
  // columnas esperadas: category_id, category_name, item_id, item_label, done (bool)
  const uid = await getActiveUserId();
  const { data, error } = await sb
    .from('items_by_category')
    .select('*')
    .eq('user_id', uid)
    .order('category_order', {ascending:true})
    .order('item_order', {ascending:true});
  if (error){
    console.warn('items_by_category no disponible o sin permisos, usando fallback.', error.message);
    return [];
  }
  return data;
}

async function upsertProgress(itemId, completed){
  // Llama al RPC correcto y con los nombres exactos de parámetros
  const { error } = await sb.rpc('upsert_progress', {
    p_item_id: itemId,
    p_completed: !!completed,
  });
  if (error) {
    console.error('upsert_progress error →', error);
    throw error;
  }
}


// =====================
// 6) RENDER GRÁFICAS
// =====================
function ensureCharts(){
  if (!barChart){
    barChart = new Chart(els.barCanvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label:'Avance', data:[], borderRadius:6, backgroundColor:'#27c093' }]},
      options: {
        indexAxis: 'y',
        responsive:true,
        plugins:{ legend:{ display:false }, tooltip:{enabled:true}},
        scales:{ x:{ beginAtZero:true, max:100, ticks:{color:'var(--text)'}},
                 y:{ ticks:{color:'var(--text)'}} }
      }
    });
  }
  if (!radarChart){
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
  // rows: [{category,label,percent,...}]
  const labels = rows.map(r=> r.label ?? r.category ?? 'Cat');
  const values = rows.map(r=> Math.round(r.percent ?? 0));

  ensureCharts();
  barChart.data.labels = labels;
  barChart.data.datasets[0].data = values;
  barChart.update();

  radarChart.data.labels = labels;
  radarChart.data.datasets[0].data = values;
  radarChart.update();

  // clic en barra -> ir a checklist y hacer scroll a la categoría
  els.barCanvas.onclick = (evt)=>{
    const points = barChart.getElementsAtEventForMode(evt,'nearest',{intersect:true},true);
    if(!points?.length) return;
    const idx = points[0].index;
    const catSlug = (rows[idx].category_slug || '').toString();
    showTab('tab-checklist');
    if (catSlug){
      const target = document.getElementById(`cat-${catSlug}`);
      if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
    }
  };
}

function renderGlobalSummary(summary){
  // summary: { percent, total_done, total_items }
  const pct = Math.round(summary?.percent ?? 0);
  const done = summary?.total_done ?? 0;
  const total = summary?.total_items ?? 0;

  els.globalBar.style.width = `${pct}%`;
  els.globalPct.textContent = `${pct}%`;
  els.globalCount.textContent = done;
  els.globalTotal.textContent = total;
}

// =====================
// 7) RENDER CHECKLIST
// =====================
function renderChecklist(rows){
  // rows grouped by category
  const byCat = new Map();
  for(const r of rows){
    const key = r.category_slug || r.category_id || r.category_name || 'categoria';
    if (!byCat.has(key)) byCat.set(key, { name: r.category_name || String(key), items: [] });
    byCat.get(key).items.push(r);
  }

  const root = els.checklistContainer;
  root.innerHTML = '';

  if (byCat.size === 0){
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No hay datos de checklist disponibles (verifica la vista "items_by_category" y sus permisos RLS).';
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
    const done = bucket.items.filter(i=>i.done).length;
    chip.textContent = `${done}/${bucket.items.length} hechos`;

    head.appendChild(title);
    head.appendChild(chip);
    wrap.appendChild(head);

    const list = document.createElement('div');
    list.className = 'list';

    for (const it of bucket.items){
      const row = document.createElement('label');
      row.className = 'item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.done;
      cb.addEventListener('change', async ()=>{
        try{
          await upsertProgress(it.item_id, cb.checked);   // ← solo item_id y el estado
          await loadDashboard(); 
          const newDone = cb.checked ? done+1 : done-1;
          chip.textContent = `${newDone}/${bucket.items.length} hechos`;
        }catch(e){
         console.error(e);
         cb.checked = !cb.checked;
        }
      });


    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = it.item_label || `Ítem ${it.item_id}`;

    const badge = document.createElement('small');
    badge.className = 'chip';
    badge.textContent = (it.item_level || '').toString(); // Essential/Optional/Advanced
    badge.style.marginLeft = '8px';

    const detail = document.createElement('div');
    detail.className = 'item-detail';
    detail.textContent = it.item_detail || '';

    row.appendChild(cb);
    row.appendChild(title);
    row.appendChild(badge);
    row.appendChild(detail);
    list.appendChild(row);

    }

    wrap.appendChild(list);
    root.appendChild(wrap);
  }
}

// =====================
// 8) CARGA DE DATOS
// =====================
async function loadDashboard(){
  try{
    const [catRows, global] = await Promise.all([
      fetchCategoryProgress().catch(_=>[]),
      fetchGlobalProgress().catch(_=>({percent:0,total_done:0,total_items:0}))
    ]);
    renderCategoryCharts(catRows);
    renderGlobalSummary(global);
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
// 9) INICIO
// =====================
console.log('Iniciando app…');
loadAll();
