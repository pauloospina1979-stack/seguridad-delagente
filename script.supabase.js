// =====================
// 1) CONFIG SUPABASE
// =====================
// Reemplaza por tus datos (dejas como los tenías):
const SUPABASE_URL = "https://piqobvnfkglhwkhqzvpe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";
const FALLBACK_USER_ID = "6abafec6-cf31-47a0-96e8-18b3cb08c0f0"; // usuario anónimo que creaste

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// helpers
const $    = (sel, el=document) => el.querySelector(sel);
const $all = (sel, el=document) => Array.from(el.querySelectorAll(sel));

const els = {
  // header / nav
  btnTheme:  $('#btnTheme'),
  btnDashTop:$('#btnDashTop'),
  btnCheckTop:$('#btnCheckTop'),
  btnLogin:  $('#btnLogin'),
  btnLogout: $('#btnLogout'),
  // tabs
  tabBtns:   $all('.tabbtn'),
  tabDash:   $('#tab-dashboard'),
  tabCheck:  $('#tab-checklist'),
  // charts + progreso global
  barCanvas:   $('#barChart'),
  radarCanvas: $('#radarChart'),
  globalBar:   $('#globalBar'),
  globalPct:   $('#globalPct'),
  globalCount: $('#globalCount'),
  globalTotal: $('#globalTotal'),
  // checklist
  checklistContainer: $('#checklistContainer'),
  // KPIs (si luego calculas por nivel)
  kpiEss: $('#kpiEss'), kpiOpt: $('#kpiOpt'), kpiAdv: $('#kpiAdv')
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
  // Al cambiar tema, refrescamos estilos de Chart.js
  destroyCharts(); ensureCharts(); loadDashboard();
}
els.btnTheme?.addEventListener('click', toggleTheme);

// =====================
// 3) NAV / TABS
// =====================
function showTab(id){
  const tab = document.getElementById(id);
  if (!tab) return;

  [els.tabDash, els.tabCheck].forEach(x => x && x.classList.remove('active'));
  $all('.tabbtn').forEach(b=> b?.classList.remove('active'));

  tab.classList.add('active');
  const btn = document.querySelector(`.tabbtn[data-tab="${id}"]`);
  btn?.classList.add('active');
}
$all('.tabbtn').forEach(btn=>{
  btn.addEventListener('click', ()=> showTab(btn.dataset.tab));
});
els.btnDashTop?.addEventListener('click', ()=> showTab('tab-dashboard'));
els.btnCheckTop?.addEventListener('click', ()=> showTab('tab-checklist'));

// =====================
// 4) AUTH (OTP POR EMAIL)
// =====================
async function refreshUserUI(){
  const { data } = await sb.auth.getUser();
  currentUser = data?.user ?? null;

  if (currentUser){
    els.btnLogin.style.display  = 'none';
    els.btnLogout.style.display = '';
  } else {
    els.btnLogin.style.display  = '';
    els.btnLogout.style.display = 'none';
  }
}

function openLoginModal(){
  const host = document.body.appendChild(document.createElement('div'));
  host.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);z-index:50;display:grid;place-items:center';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;min-width:320px';
  box.innerHTML = `
    <h3 style="margin-top:0">Iniciar sesión</h3>
    <p class="muted">Te enviaremos un enlace mágico al correo.</p>
    <input id="emailInput" type="email" placeholder="tu@correo.com" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text)">
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button id="closeLogin" class="btn">Cancelar</button>
      <button id="sendLink" class="btn primary">Enviar enlace</button>
    </div>
    <div id="loginMsg" class="muted" style="margin-top:8px"></div>
  `;
  host.appendChild(box);

  $('#closeLogin',box).onclick = ()=> host.remove();
  $('#sendLink',box).onclick = async ()=>{
    const email = $('#emailInput',box).value.trim();
    if (!email){ $('#loginMsg',box).textContent='Ingresa un correo válido.'; return; }
    $('#sendLink',box).disabled = true; $('#loginMsg',box).textContent='Enviando...';
    try{
      const { error } = await sb.auth.signInWithOtp({
        email, options:{ emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      $('#loginMsg',box).textContent = 'Revisa tu correo y sigue el enlace para iniciar sesión.';
    }catch(e){
      $('#loginMsg',box).textContent = 'Error: ' + (e.message || e);
    }finally{
      $('#sendLink',box).disabled = false;
    }
  };
}
els.btnLogin?.addEventListener('click', openLoginModal);
els.btnLogout?.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  await refreshUserUI();
  await loadAll();
});

// =====================
// 5) LLAMADAS RPC / CONSULTAS
// =====================
async function getActiveUserId(){
  const { data } = await sb.auth.getUser();
  return data?.user?.id || FALLBACK_USER_ID;
}

// IMPORTANTE: usa los nombres reales de los parámetros en tus RPCs (p_user_id)
async function fetchCategoryProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_category_progress', { p_user_id: uid });
  if (error){ console.error('rpc_category_progress error', error); throw error; }
  return data || [];
}

async function fetchGlobalProgress(){
  const uid = await getActiveUserId();
  const { data, error } = await sb.rpc('rpc_global_progress', { p_user_id: uid });
  if (error){ console.error('rpc_global_progress error', error); throw error; }
  const row = Array.isArray(data) ? (data[0] || null) : data;
  return row || { total_done: 0, total_items: 0, percent: 0 };
}

async function fetchChecklistData(){
  const uid = await getActiveUserId();
  // Vista items_by_category debe exponer: user_id, category_id, category_name/slug, item_id, item_label, done, category_order, item_order
  const q = sb.from('items_by_category').select('*').eq('user_id', uid);
  // si existen columnas de orden, las usamos
  try{ q.order('category_order', { ascending:true }); }catch(_){}
  try{ q.order('item_order', { ascending:true }); }catch(_){}
  const { data, error } = await q;
  if (error){
    console.warn('items_by_category no disponible, usando fallback.', error.message);
    return [];
  }
  return data || [];
}

async function upsertProgress(itemId, categoryId, completed){
  const uid = await getActiveUserId();
  // RPC: rpc_upsert_progress(p_user_id uuid, p_item_id bigint, p_completed bool)
  const { error } = await sb.rpc('rpc_upsert_progress', {
    p_user_id: uid,
    p_item_id: itemId,
    p_completed: !!completed
  });
  if (error) console.error('upsert_progress error →', error);
}

// =====================
// 6) GRÁFICAS
// =====================
function destroyCharts(){
  if (barChart){ barChart.destroy(); barChart=null; }
  if (radarChart){ radarChart.destroy(); radarChart=null; }
}

function ensureCharts(){
  const css = getComputedStyle(document.documentElement);
  const colLine = css.getPropertyValue('--accent').trim() || '#27c093';
  const colFill = css.getPropertyValue('--accent-25').trim() || 'rgba(39,192,147,.25)';
  const colText = css.getPropertyValue('--text').trim() || '#101010';
  const colGrid = css.getPropertyValue('--border').trim() || '#e5e7eb';

  if (!barChart){
    barChart = new Chart(els.barCanvas, {
      type: 'bar',
      data: { labels: [], datasets: [{ label:'Avance', data:[], borderRadius:8 }]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        layout: { padding:{ left:8, right:8, top:8, bottom:8 } },
        plugins:{ legend:{ display:false }, tooltip:{ enabled:true } },
        scales:{
          x:{ beginAtZero:true, max:100, ticks:{ color:colText }, grid:{ color:colGrid }},
          y:{ ticks:{ color:colText }, grid:{ display:false } }
        },
        elements:{
          bar:{
            backgroundColor:(ctx)=>{
              const v = ctx.raw ?? 0;
              if (v >= 75) return '#1db954';
              if (v >= 40) return '#f5b301';
              return '#ff6b6b';
            },
            borderSkipped:false,
            barPercentage:0.7,
            categoryPercentage:0.8,
            maxBarThickness:38
          }
        }
      }
    });
  }

  if (!radarChart){
    radarChart = new Chart(els.radarCanvas, {
      type: 'radar',
      data: { labels: [], datasets:[{ label:'Avance %', data:[], fill:true }]},
      options: {
        responsive:true,
        maintainAspectRatio:false,
        plugins:{ legend:{ display:false }},
        scales:{
          r:{
            suggestedMin:0, suggestedMax:100,
            angleLines:{ color:colGrid },
            grid:{ color:colGrid },
            pointLabels:{ color:colText, font:{ size:12 } },
            ticks:{ display:false }
          }
        },
        elements:{
          line:{ borderColor: colLine, borderWidth:2 },
          point:{ backgroundColor: colLine, radius:3 },
          polygon:{ backgroundColor: colFill }
        }
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

  // clic en barra -> ir a checklist y hacer scroll
  els.barCanvas.onclick = (evt)=>{
    const points = barChart.getElementsAtEventForMode(evt,'nearest',{intersect:true},true);
    if(!points?.length) return;
    const idx = points[0].index;
    const catSlug = (rows[idx].category_slug || rows[idx].category || '').toString();
    showTab('tab-checklist');
    if (catSlug){
      const target = document.getElementById(`cat-${catSlug}`);
      if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
    }
  };
}

function renderGlobalSummary(summary){
  const pct   = Math.round(summary?.percent ?? 0);
  const done  = summary?.total_done ?? 0;
  const total = summary?.total_items ?? 0;

  els.globalBar.style.width = `${pct}%`;
  els.globalPct.textContent   = `${pct}%`;
  els.globalCount.textContent = done;
  els.globalTotal.textContent = total;
}

// =====================
// 7) CHECKLIST
// =====================
function renderChecklist(rows){
  const byCat = new Map();
  for(const r of rows){
    const key = r.category_slug || r.category_id || r.category_name || 'categoria';
    if (!byCat.has(key)) byCat.set(key, { name: r.category_name || String(key), slug: key, items: [] });
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
    wrap.className = 'card'; wrap.id = `cat-${slug}`;

    const head = document.createElement('div');
    head.className = 'catHead';

    const title = document.createElement('h3');
    title.textContent = bucket.name; title.style.margin='0';

    const chip = document.createElement('div');
    chip.className = 'chip';
    const doneInit = bucket.items.filter(i=>i.done).length;
    chip.textContent = `${doneInit}/${bucket.items.length} hechos`;

    head.appendChild(title); head.appendChild(chip);
    wrap.appendChild(head);

    const list = document.createElement('div');
    list.className = 'list';

    let doneCounter = doneInit;

    for (const it of bucket.items){
      const row = document.createElement('label');
      row.className = 'item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.done;

      cb.addEventListener('change', async ()=>{
        try{
          await upsertProgress(it.item_id, it.category_id, cb.checked);
          // refrescar dashboard + contador local de la categoría
          await loadDashboard();
          doneCounter += (cb.checked ? 1 : -1);
          chip.textContent = `${doneCounter}/${bucket.items.length} hechos`;
        }catch(e){
          console.error(e);
          cb.checked = !cb.checked; // revertir ante error
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
// 8) CARGA
// =====================
async function loadDashboard(){
  try{
    const [catRows, global] = await Promise.all([
      fetchCategoryProgress().catch(_=>[]),
      fetchGlobalProgress().catch(_=>({ percent:0, total_done:0, total_items:0 }))
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
  destroyCharts(); ensureCharts();
  await loadDashboard();
  await loadChecklist();
}

// =====================
// 9) START
// =====================
console.log('Iniciando app…');
loadAll();
