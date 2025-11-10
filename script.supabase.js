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

  statEss: $('#statEss'),
  statOpt: $('#statOpt'),
  statAdv: $('#statAdv'),

  categoryCards: $('#categoryCards'),
  checklistContainer: $('#checklistContainer'),
};

let barChart, radarChart;
let currentUser = null;

// =====================
// 2) THEME TOGGLE
// =====================
function toggleTheme(){
  const root = document.documentElement;
  root.setAttribute('data-theme', (root.getAttribute('data-theme') === 'dark') ? 'light' : 'dark');
}
els.btnTheme.addEventListener('click', toggleTheme);

// =====================
// 3) NAV / TABS
// =====================
function showTab(id){
  els.tabDash.classList.add('hidden');
  els.tabCheck.classList.add('hidden');
  if (id === 'tab-dashboard') els.tabDash.classList.remove('hidden');
  if (id === 'tab-checklist') els.tabCheck.classList.remove('hidden');
}
els.btnDashTop.onclick = ()=>showTab('tab-dashboard');
els.btnCheckTop.onclick = ()=>showTab('tab-checklist');

// =====================
// 4) AUTH (OTP email)
// =====================
async function refreshUserUI(){
  const { data } = await sb.auth.getUser();
  currentUser = data?.user ?? null;

  if (currentUser){
    els.btnLogin.style.display = 'none';
    els.btnLogout.style.display = '';
  } else {
    els.btnLogin.style.display = '';
    els.btnLogout.style.display = 'none';
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
  await loadAll();
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
  if (error){ console.error('rpc_category_progress', error); return []; }
  return data || [];
}
async function fetchGlobalProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_global_progress', { user_id: uid });
  if (error){ console.error('rpc_global_progress', error); return { total_done:0,total_items:0,percent:0 }; }
  return data || { total_done:0,total_items:0,percent:0 };
}
async function fetchCategories(){
  // para tarjetas (nombre/desc). Si RLS no permite, devolvemos vacío.
  const { data, error } = await sb.from('categories').select('id,slug,name,description,order').order('order', {ascending:true}).order('name', {ascending:true});
  if (error){ console.warn('categories no accesible', error.message); return []; }
  return data || [];
}
async function fetchChecklistData(){
  const uid = await getActiveUserId();
  // vista recomendada (si no, devolvemos vacío)
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
  return data || [];
}
async function upsertProgress(itemId, completed){
  const uid = await getActiveUserId();
  // RPC con firma: (user_id uuid, p_item_id bigint, p_completed bool)
  const { error } = await sb.rpc('rpc_upsert_progress', {
    user_id: uid,
    p_item_id: itemId,
    p_completed: !!completed
  });
  if (error) throw error;
}

// =====================
// 6) CHARTS + COLORES
// =====================
function ensureCharts(){
  if (!barChart){
    barChart = new Chart(els.barCanvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label:'Avance', data:[], borderRadius:6 } ]},
      options: {
        indexAxis: 'y',
        responsive:true,
        plugins:{ legend:{ display:false }},
        scales:{
          x:{ beginAtZero:true, max:100, ticks:{color:'var(--muted)'}, grid:{color:'var(--border)'}},
          y:{ ticks:{color:'var(--text)'}, grid:{color:'var(--border)'} }
        }
      }
    });
  }
  if (!radarChart){
    radarChart = new Chart(els.radarCanvas, {
      type: 'radar',
      data: { labels: [], datasets:[{ label:'% Avance', data:[], fill:true, pointRadius:3 }]},
      options: {
        responsive:true, plugins:{ legend:{ display:false }},
        scales:{ r:{
          angleLines:{color:'var(--border)'}, grid:{color:'var(--border)'},
          pointLabels:{color:'var(--muted)'}, ticks:{display:false, max:100}
        }}
      }
    });
  }
}
function colorFor(p){
  if (p >= 66) return '#27c093';      // alto
  if (p >= 33) return '#e3b341';      // medio
  return '#e07166';                   // bajo
}
function renderCategoryCharts(rows){
  ensureCharts();

  const labels = rows.map(r=> r.label ?? r.category ?? 'Cat');
  const values = rows.map(r=> Math.round(r.percent ?? 0));
  const colors = values.map(colorFor);

  // barras
  barChart.data.labels = labels;
  barChart.data.datasets[0].data = values;
  barChart.data.datasets[0].backgroundColor = colors;
  barChart.update();

  // radar
  radarChart.data.labels = labels;
  radarChart.data.datasets[0].data = values;
  radarChart.data.datasets[0].backgroundColor = 'rgba(39,192,147,0.18)';
  radarChart.data.datasets[0].borderColor = '#27c093';
  radarChart.data.datasets[0].pointBackgroundColor = colors;
  radarChart.update();

  // click en barra -> ir a categoría del checklist
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
  const pct = Math.round(summary?.percent ?? 0);
  const done = summary?.total_done ?? 0;
  const total = summary?.total_items ?? 0;

  els.globalBar.style.width = `${pct}%`;
  els.globalPct.textContent = `${pct}%`;
  els.globalCount.textContent = done;
  els.globalTotal.textContent = total;
}

// =====================
// 7) TARJETAS DE CATEGORÍAS
// =====================
function renderCategoryCards(categories, progressRows){
  const byId = new Map(progressRows.map(r => [String(r.category), r]));
  els.categoryCards.innerHTML = '';
  for (const c of categories){
    const p = byId.get(String(c.id))?.percent ?? 0;
    const total = byId.get(String(c.id))?.count_total ?? 0;
    const done = byId.get(String(c.id))?.count_done ?? 0;

    const card = document.createElement('a');
    card.href = '#';
    card.className = 'catCard plain';
    card.onclick = (e)=>{ e.preventDefault(); showTab('tab-checklist'); const t = document.getElementById(`cat-${c.slug||c.id}`); if(t) t.scrollIntoView({behavior:'smooth'}) };

    const top = document.createElement('div');
    top.className = 'catTop';
    const title = document.createElement('h4');
    title.className = 'catTitle';
    title.textContent = c.name || 'Categoría';
    const chip = document.createElement('div');
    chip.className='chip';
    chip.textContent = `${done}/${total} hechos`;
    top.appendChild(title); top.appendChild(chip);

    const desc = document.createElement('div');
    desc.className = 'small';
    desc.textContent = c.description || '—';

    const bar = document.createElement('div');
    bar.className = 'catBar';
    const barFill = document.createElement('i');
    barFill.style.width = `${Math.round(p)}%`;
    barFill.style.background = colorFor(p);
    bar.appendChild(barFill);

    card.appendChild(top);
    card.appendChild(desc);
    card.appendChild(bar);
    els.categoryCards.appendChild(card);
  }
}

// =====================
// 8) CHECKLIST (render + update)
// =====================
function renderChecklist(rows){
  // agrupar
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
    root.appendChild(empty); return;
  }

  for (const [slug, bucket] of byCat.entries()){
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.id = `cat-${slug}`;

    const head = document.createElement('div');
    head.style.display='flex'; head.style.justifyContent='space-between'; head.style.alignItems='center';
    const title = document.createElement('h4'); title.textContent = bucket.name; title.style.margin='0';
    const chip = document.createElement('div'); chip.className='chip';
    const done0 = bucket.items.filter(i=>i.done).length;
    chip.textContent = `${done0}/${bucket.items.length} hechos`;
    head.appendChild(title); head.appendChild(chip);
    wrap.appendChild(head);

    const list = document.createElement('div');
    for (const it of bucket.items){
      const row = document.createElement('label');
      row.style.display='flex'; row.style.gap='10px'; row.style.alignItems='center'; row.style.padding='12px 0'; row.style.borderTop='1px solid var(--border)';

      const cb = document.createElement('input');
      cb.type='checkbox'; cb.checked=!!it.done;

      cb.addEventListener('change', async ()=>{
        const prev = !cb.checked;
        try{
          await upsertProgress(it.item_id, cb.checked);
          // refrescar dashboard + checklist + tarjetas + global
          await loadDashboard();
          await loadChecklist();
        }catch(e){
          console.error('upsert_progress error', e);
          cb.checked = prev; // revertir
        }
      });

      const span = document.createElement('span');
      span.textContent = it.item_label || `Ítem ${it.item_id}`;
      row.appendChild(cb); row.appendChild(span);
      list.appendChild(row);
    }
    wrap.appendChild(list);
    root.appendChild(wrap);
  }
}

// =====================
// 9) CARGA DE DATOS
// =====================
async function loadDashboard(){
  const [rows, global] = await Promise.all([
    fetchCategoryProgress(),
    fetchGlobalProgress()
  ]);
  renderCategoryCharts(rows);
  renderGlobalSummary(global);

  // mini-métricas por nivel (si no tienes level por ahora, dejamos 0)
  // Si tu vista / RPC entrega por nivel, aquí puedes calcularlo.
  els.statEss.textContent = `${Math.round(rows.reduce((a,r)=>a+0,0))}%`;
  els.statOpt.textContent = `0%`;
  els.statAdv.textContent = `0%`;

  // tarjetas categorías (unimos categorías con % de la RPC)
  const cats = await fetchCategories();
  renderCategoryCards(cats, rows);
}

async function loadChecklist(){
  const rows = await fetchChecklistData();
  renderChecklist(rows);
}

async function loadAll(){
  await refreshUserUI();
  await Promise.all([loadDashboard(), loadChecklist()]);
}

// =====================
// 10) INICIO
// =====================
console.log('Iniciando app…');
showTab('tab-dashboard');
loadAll();
