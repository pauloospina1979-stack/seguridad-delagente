// =====================
// 1) CONFIG SUPABASE
// =====================
const SUPABASE_URL = "https://piqobvnfkglhwkhqzvpe.supabase.co";   // TU URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";
const FALLBACK_USER_ID = "6abafec6-cf31-47a0-96e8-18b3cb08c0f0";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// helpers
const $ = (sel, el=document)=> el.querySelector(sel);
const $all = (sel, el=document)=> Array.from(el.querySelectorAll(sel));

// elementos
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

  kpiEss: $('#kpiEss'),
  kpiOpt: $('#kpiOpt'),
  kpiAdv: $('#kpiAdv'),

  checklistContainer: $('#checklistContainer')
};

let barChart, radarChart, currentUser = null;

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
  [els.tabDash, els.tabCheck].forEach(x => x.classList.add('hidden'));
  $all('.tabbtn').forEach(b=>b.classList.remove('active'));
  $('#'+id).classList.remove('hidden');
  $(`.tabbtn[data-tab="${id}"]`)?.classList.add('active');
}
$all('.tabbtn').forEach(btn=>{
  btn.addEventListener('click', ()=> showTab(btn.dataset.tab));
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
  }else{
    els.btnLogin.classList.remove('hidden');
    els.btnLogout.classList.add('hidden');
  }
}
els.btnLogin.addEventListener('click', openLoginModal);
els.btnLogout.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  await refreshUserUI();
  await loadAll();
});
function openLoginModal(){
  const host = document.body.appendChild(document.createElement('div'));
  host.id = 'loginHost';
  host.style = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);z-index:50;display:grid;place-items:center';
  host.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:420px;width:92%">
      <h3 style="margin:0 0 10px 0">Iniciar sesión</h3>
      <input id="emailInput" type="email" placeholder="tu@correo.com" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--border);background:var(--soft);color:var(--text)">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="sendLink" class="btn primary">Enviar enlace</button>
        <button id="closeLogin" class="btn ghost">Cerrar</button>
      </div>
      <div id="loginMsg" class="muted" style="margin-top:8px"></div>
    </div>`;
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

// =====================
// 5) DATA (RPC + VISTAS)
// =====================
async function getActiveUserId(){
  const { data } = await sb.auth.getUser();
  return data?.user?.id || FALLBACK_USER_ID;
}

async function fetchCategoryProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_category_progress', { user_id: uid });
  if (error){ console.warn('rpc_category_progress error', error); return []; }
  return data || [];
}
async function fetchGlobalProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_global_progress', { p_user_id: uid }); // firma con p_user_id
  if (error){ console.warn('rpc_global_progress error', error); return {percent:0,total_done:0,total_items:0}; }
  return data;
}

// (NUEVO) vista checklist con descripción
async function fetchChecklistData(){
  const uid = await getActiveUserId();

  // 1) intenta la v2 con descripción
  let q = sb.from('items_by_category_v2')
    .select('category_id,category_slug,category_name,item_id,item_label,item_detail,item_level,done')
    .eq('user_id', uid);

  let { data, error } = await q;
  if (!error && data) return data;

  // 2) Fallback a items_by_category (sin description)
  console.warn('items_by_category_v2 no disponible; usando fallback a items_by_category');
  let q2 = sb.from('items_by_category')
    .select('category_id,category_slug,category_name,item_id,item_label,item_level,done')
    .eq('user_id', uid);
  let fb = await q2;
  return fb.data || [];
}

async function upsertProgress(itemId, categoryId, completed){
  const uid = await getActiveUserId();
  // RPC de upsert
  const { error } = await sb.rpc('rpc_upsert_progress', {
    user_id: uid,
    p_item_id: itemId,
    p_completed: !!completed
  });
  if (error) console.error('upsert_progress error →', error);
}

// =====================
// 6) CHARTS
// =====================
function ensureCharts(){
  if (!barChart){
    barChart = new Chart(els.barCanvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label:'Avance', data:[], borderRadius:6, backgroundColor:'#27c093' }]},
      options: {
        indexAxis:'y',responsive:true,
        plugins:{ legend:{display:false}},
        scales:{
          x:{ beginAtZero:true, max:100, grid:{color:'rgba(148,163,184,.25)'}},
          y:{ grid:{display:false}}
        }
      }
    });
  }
  if (!radarChart){
    radarChart = new Chart(els.radarCanvas, {
      type:'radar',
      data:{ labels:[], datasets:[{label:'Avance %', data:[], fill:true, backgroundColor:'rgba(39,192,147,.22)', borderColor:'#27c093', pointBackgroundColor:'#27c093'}]},
      options:{
        plugins:{legend:{display:false}},
        scales:{ r:{angleLines:{color:'rgba(148,163,184,.25)'}, grid:{color:'rgba(148,163,184,.25)'}, pointLabels:{color:'var(--text)'}, ticks:{display:false,max:100}}}
      }
    });
  }
}
function renderCategoryCharts(rows){
  const labels = rows.map(r=> r.label ?? r.category ?? 'Cat');
  const values = rows.map(r=> Math.round(r.percent ?? 0));
  ensureCharts();
  barChart.data.labels = labels;
  barChart.data.datasets[0].data = values;
  barChart.update();

  radarChart.data.labels = labels;
  radarChart.data.datasets[0].data = values;
  radarChart.update();

  // click → saltar a checklist y hacer scroll a la categoría
  els.barCanvas.onclick = (evt)=>{
    const pts = barChart.getElementsAtEventForMode(evt,'nearest',{intersect:true},true);
    if(!pts?.length) return;
    const idx = pts[0].index;
    const catSlug = (rows[idx].category_slug || '').toString();
    showTab('tab-checklist');
    if (catSlug){
      const target = document.getElementById(`cat-${catSlug}`);
      if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
    }
  };
}
function renderGlobalSummary(sum){
  const pct = Math.round(sum?.percent ?? 0);
  els.globalBar.style.width = `${pct}%`;
  els.globalPct.textContent = `${pct}%`;
  els.globalCount.textContent = sum?.total_done ?? 0;
  els.globalTotal.textContent = sum?.total_items ?? 0;
}

// =====================
// 7) CHECKLIST (tipo SAFE)
// =====================
function badgeClass(level){
  const lv = (level||'').toLowerCase();
  if (lv.startsWith('adv')) return 'advanced';
  if (lv.startsWith('opt')) return 'optional';
  return 'essential';
}
function renderChecklist(rows){
  // agrupar por categoría
  const byCat = new Map();
  for(const r of rows){
    const key = r.category_slug || r.category_id || r.category_name || 'cat';
    if (!byCat.has(key)) byCat.set(key, {name: r.category_name || String(key), slug: r.category_slug || key, items: []});
    byCat.get(key).items.push(r);
  }

  const root = els.checklistContainer;
  root.innerHTML = '';
  if (byCat.size===0){
    root.innerHTML = `<div class="card muted">No hay datos de checklist disponibles (verifica la vista "items_by_category_v2" o "items_by_category" y sus permisos RLS).</div>`;
    return;
  }

  for (const [slug, bucket] of byCat.entries()){
    const wrap = document.createElement('div');
    wrap.className = 'catCard';
    wrap.id = `cat-${slug}`;

    // encabezado categoría
    const head = document.createElement('div');
    head.className = 'catHead';
    const h = document.createElement('h3');
    h.className = 'catTitle';
    h.textContent = bucket.name;
    const chip = document.createElement('div');
    chip.className = 'chip';
    const doneInit = bucket.items.filter(i=>i.done).length;
    chip.textContent = `${doneInit}/${bucket.items.length} hechos`;
    head.appendChild(h); head.appendChild(chip);
    wrap.appendChild(head);

    // lista
    const list = document.createElement('div');
    list.className = 'list';

    bucket.items.forEach(it=>{
      const row = document.createElement('div');
      row.className = 'itemRow';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.done;

      const right = document.createElement('div');
      const title = document.createElement('h4');
      title.className = 'itemTitle';
      title.textContent = it.item_label || `Ítem ${it.item_id}`;

      const badge = document.createElement('span');
      badge.className = `badge ${badgeClass(it.item_level)}`;
      badge.textContent = (it.item_level||'').toLowerCase();

      const desc = document.createElement('p');
      desc.className = 'itemDesc';
      desc.textContent = it.item_detail || ''; // si viene de v2 mostramos descripción

      // interacciones
      cb.addEventListener('change', async ()=>{
        try{
          await upsertProgress(it.item_id, it.category_id, cb.checked);
          // refrescar dashboard y chip
          const newDone = bucket.items.filter(x => x.item_id===it.item_id ? cb.checked : !!x.done).filter(x=>x).length;
          // recalcular real:
          const truly = bucket.items.reduce((acc,x)=> acc + (x.item_id===it.item_id ? (cb.checked?1:0) : (x.done?1:0)), 0);
          chip.textContent = `${truly}/${bucket.items.length} hechos`;
          // persistimos en memoria
          it.done = cb.checked;
          await loadDashboard();
        }catch(e){
          console.error(e);
          cb.checked = !cb.checked;
        }
      });

      title.appendChild(badge);
      right.appendChild(title);
      if ((it.item_detail||'').trim().length) right.appendChild(desc);

      row.appendChild(cb);
      row.appendChild(right);
      list.appendChild(row);
    });

    wrap.appendChild(list);
    root.appendChild(wrap);
  }
}

// =====================
// 8) CARGA
// =====================
async function loadDashboard(){
  try{
    const [catRows, global] = await Promise.all([
      fetchCategoryProgress().catch(()=>[]),
      fetchGlobalProgress().catch(()=>({percent:0,total_done:0,total_items:0}))
    ]);
    renderCategoryCharts(catRows);
    renderGlobalSummary(global);

    // KPIs por nivel (muy simple: cuenta ítems hechos por nivel / total por nivel)
    // Si tuvieras RPC dedicado, cámbialo por ese.
    try{
      const rows = await fetchChecklistData();
      const levels = { essential:{done:0,total:0}, optional:{done:0,total:0}, advanced:{done:0,total:0} };
      rows.forEach(r=>{
        const k = (r.item_level||'essential').toLowerCase();
        if (!levels[k]) return;
        levels[k].total++;
        if (r.done) levels[k].done++;
      });
      const pct = (x)=> x.total ? Math.round((x.done*100)/x.total) : 0;
      els.kpiEss.textContent = `${pct(levels.essential)}%`;
      els.kpiOpt.textContent = `${pct(levels.optional)}%`;
      els.kpiAdv.textContent = `${pct(levels.advanced)}%`;
    }catch(_){}
  }catch(e){
    console.error('Error cargando dashboard', e);
  }
}
async function loadChecklist(){
  try{
    const rows = await fetchChecklistData();
    renderChecklist(rows);
  }catch(e){
    console.error('Error checklist', e);
    els.checklistContainer.innerHTML = `<div class="card">Error cargando checklist: ${e.message||e}</div>`;
  }
}
async function loadAll(){
  await refreshUserUI();
  await loadDashboard();
  await loadChecklist();
}

// =====================
// 9) INIT
// =====================
console.log('Iniciando app…');
loadAll();
