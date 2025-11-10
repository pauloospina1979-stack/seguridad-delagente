// =====================
// 1) CONFIG SUPABASE
// =====================
const SUPABASE_URL = "https://piqobvnfkglhwkhqzvpe.supabase.co";   // <-- TU URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";               // <-- TU ANON KEY
// UUID de usuario “anónimo” que definiste (o deja uno fijo si no hay auth activa)
const FALLBACK_USER_ID = "6abafec6-cf31-47a0-96e8-18b3cb08c0f0";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// helpers
const $ = (sel, el=document) => el.querySelector(sel);
const $all = (sel, el=document) => Array.from(el.querySelectorAll(sel));

const els = {
  btnTheme:   $('#btnTheme'),
  btnDashTop: $('#btnDashTop'),
  btnCheckTop:$('#btnCheckTop'),
  btnLogin:   $('#btnLogin'),
  btnLogout:  $('#btnLogout'),

  tabDash:    $('#tab-dashboard'),
  tabCheck:   $('#tab-checklist'),

  barCanvas:  $('#barChart'),
  radarCanvas:$('#radarChart'),

  globalBar:  $('#globalBar'),
  globalPct:  $('#globalPct'),
  globalCount:$('#globalCount'),
  globalTotal:$('#globalTotal'),

  kpiEssential: $('#kpiEssential'),
  kpiOptional:  $('#kpiOptional'),
  kpiAdvanced:  $('#kpiAdvanced'),

  checklistContainer: $('#checklistContainer'),
};

let barChart, radarChart;
let currentUser = null;

// =====================
// 2) THEME TOGGLE
// =====================
function toggleTheme(){
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme') || 'light';
  root.setAttribute('data-theme', cur === 'light' ? 'dark' : 'light');
}
els.btnTheme.addEventListener('click', toggleTheme);

// =====================
// 3) NAV / TABS
// =====================
function showTab(id){
  // protege contra nulls si el botón no existe
  [els.tabDash, els.tabCheck].forEach(x => x && x.classList.add('hidden'));
  if (id === 'tab-dashboard') els.tabDash.classList.remove('hidden');
  if (id === 'tab-checklist') els.tabCheck.classList.remove('hidden');
}
els.btnDashTop.addEventListener('click', ()=> showTab('tab-dashboard'));
els.btnCheckTop.addEventListener('click',()=> showTab('tab-checklist'));

// =====================
// 4) AUTH (OTP por email)
// =====================
async function refreshUserUI(){
  const { data } = await sb.auth.getUser();
  currentUser = data?.user ?? null;
  if (currentUser){
    els.btnLogin.style.display='none';
    els.btnLogout.style.display='';
  }else{
    els.btnLogin.style.display='';
    els.btnLogout.style.display='none';
  }
}

function openLoginModal(){
  const host = document.body.appendChild(document.createElement('div'));
  host.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);z-index:50';
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
        options:{ emailRedirectTo: window.location.origin + window.location.pathname }
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
  await loadAll();
});

// =====================
// 5) DATA HELPERS (RPC / SELECTs)
// =====================
async function getActiveUserId(){
  const { data } = await sb.auth.getUser();
  return data?.user?.id || FALLBACK_USER_ID;
}

async function fetchCategoryProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_category_progress', { user_id: uid });
  if (error){ console.error('rpc_category_progress error', error); return []; }
  return data || [];
}

async function fetchGlobalProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_global_progress', { p_user_id: uid });
  if (error){ console.error('rpc_global_progress error', error); return { total_done:0,total_items:0,percent:0 }; }
  // data puede venir como array con 1 fila
  const row = Array.isArray(data) ? data[0] : data;
  return row || { total_done:0,total_items:0,percent:0 };
}

async function fetchChecklistRows(){
  const uid = await getActiveUserId();
  const { data, error } = await sb
    .from('items_by_category')
    .select('*')
    .eq('user_id', uid)              // si no hay filas para uid, igual devuelve todas con user_id null
    .order('category_order', {ascending:true})
    .order('item_order', {ascending:true});
  if (error){
    console.warn('items_by_category fallback: ', error.message);
    return [];
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
  if (error) console.error('upsert_progress error', error);
}

// =====================
// 6) CHARTS
// =====================
function colorFor(p){
  if (p >= 80) return '#10b981';   // verde
  if (p >= 40) return '#f59e0b';   // ámbar
  return '#ef4444';                // rojo
}
function ensureCharts(){
  if (!barChart){
    barChart = new Chart(els.barCanvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label:'Avance (%)', data:[], borderRadius:8, backgroundColor:[] }]},
      options: {
        indexAxis: 'y',
        responsive:true,
        maintainAspectRatio:false,
        plugins:{ legend:{ display:false }, tooltip:{enabled:true}},
        scales:{
          x:{ beginAtZero:true, max:100, ticks:{color: getComputedStyle(document.documentElement).getPropertyValue('--text')}},
          y:{ ticks:{color: getComputedStyle(document.documentElement).getPropertyValue('--text')}}
        }
      }
    });
  }
  if (!radarChart){
    radarChart = new Chart(els.radarCanvas, {
      type: 'radar',
      data: { labels: [], datasets:[{ label:'Avance %', data:[], fill:true, backgroundColor:'rgba(16,185,129,.20)', borderColor:'#10b981', pointBackgroundColor:'#10b981'}]},
      options: {
        responsive:true,
        maintainAspectRatio:false,
        scales:{ r:{ angleLines:{color: getComputedStyle(document.documentElement).getPropertyValue('--border')},
                     grid:{color: getComputedStyle(document.documentElement).getPropertyValue('--border')},
                     pointLabels:{color: getComputedStyle(document.documentElement).getPropertyValue('--text')},
                     ticks:{display:false, max:100} } },
        plugins:{ legend:{ display:false }}
      }
    });
  }
}

function renderCategoryCharts(rows){
  const labels = rows.map(r=> r.label ?? r.category ?? 'Cat');
  const values = rows.map(r=> Math.round(r.percent ?? 0));
  const colors = values.map(v => colorFor(v));

  ensureCharts();
  // Barras
  barChart.data.labels = labels;
  barChart.data.datasets[0].data = values;
  barChart.data.datasets[0].backgroundColor = colors;
  barChart.update();

  // Radar
  radarChart.data.labels = labels;
  radarChart.data.datasets[0].data = values;
  radarChart.update();

  // Click en una barra → abre checklist y hace scroll
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

function renderGlobal(summary){
  const pct  = Math.round(summary?.percent ?? 0);
  const done = summary?.total_done ?? 0;
  const tot  = summary?.total_items ?? 0;
  els.globalBar.style.width = `${pct}%`;
  els.globalPct.textContent = `${pct}%`;
  els.globalCount.textContent = done;
  els.globalTotal.textContent = tot;
}

// KPIs por nivel (Esencial / Opcional / Avanzado), calculados en cliente desde la vista
function renderLevelKPIs(rows){
  // Agrupa por nivel: total ítems y cuántos hechos
  const acc = {
    essential: { done:0, total:0 },
    optional:  { done:0, total:0 },
    advanced:  { done:0, total:0 },
  };
  for (const r of rows){
    const lvl = (r.item_level || 'essential').toLowerCase();
    if (!acc[lvl]) continue;
    acc[lvl].total += 1;
    if (r.done) acc[lvl].done += 1;
  }
  const pct = (o)=> (o.total>0 ? Math.round((o.done*100)/o.total) : 0);

  els.kpiEssential.textContent = pct(acc.essential) + '%';
  els.kpiOptional.textContent  = pct(acc.optional)  + '%';
  els.kpiAdvanced.textContent  = pct(acc.advanced)  + '%';
}

// =====================
// 7) CHECKLIST RENDER
// =====================
function renderChecklist(rows){
  const root = els.checklistContainer;
  root.innerHTML = '';

  // agrupa por categoría
  const byCat = new Map();
  for(const r of rows){
    const key = r.category_slug || r.category_id || r.category_name || 'cat';
    if(!byCat.has(key)) byCat.set(key, { slug:key, name: r.category_name || String(key), items: [] });
    byCat.get(key).items.push(r);
  }

  if (byCat.size===0){
    const empty = document.createElement('div');
    empty.className='muted';
    empty.textContent = 'No hay datos de checklist disponibles (verifica la vista "items_by_category" y sus permisos RLS).';
    root.appendChild(empty);
    return;
  }

  for(const [,bucket] of byCat.entries()){
    const wrap  = document.createElement('div'); wrap.className='cat'; wrap.id = `cat-${bucket.slug}`;
    const head  = document.createElement('div'); head.className='catHead';
    const title = document.createElement('h3'); title.textContent = bucket.name; title.style.margin='0';
    const chip  = document.createElement('div'); chip.className='chip';

    const doneCount = bucket.items.filter(i=>i.done).length;
    chip.textContent = `${doneCount}/${bucket.items.length} hechos`;
    head.appendChild(title); head.appendChild(chip); wrap.appendChild(head);

    const list = document.createElement('div'); list.className='list';
    for(const it of bucket.items){
      const row = document.createElement('label'); row.className='item';

      const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = !!it.done;
      cb.addEventListener('change', async ()=>{
        const prev = !cb.checked;
        try{
          await upsertProgress(it.item_id, cb.checked);
          // refresca tablero y KPIs
          await loadDashboard();
          // refresca chip rápido
          const newDone = (cb.checked ? doneCount+1 : doneCount-1);
          chip.textContent = `${newDone}/${bucket.items.length} hechos`;
        }catch(e){
          console.error(e);
          cb.checked = prev; // revierte
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
async function loadDashboard(){
  // category progress + global + rows (para KPIs)
  const [catRows, global, rows] = await Promise.all([
    fetchCategoryProgress(),
    fetchGlobalProgress(),
    fetchChecklistRows()
  ]);
  renderCategoryCharts(catRows);
  renderGlobal(global);
  renderLevelKPIs(rows);
}

async function loadChecklist(){
  const rows = await fetchChecklistRows();
  renderChecklist(rows);
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
showTab('tab-dashboard');
loadAll();
