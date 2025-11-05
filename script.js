/***** 0) CONFIG: EDITA TU SUPABASE ******/
const SUPABASE_URL = "https://piqobvnfkglhwkhqzvpe.supabase.co"; // 👈 EDITA
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";                     // 👈 EDITA
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/***** 1) DATOS: CATEGORÍAS + ÍTEMS (puedes cambiar textos) *****/
const DATA = [
  { catId:"cuentas", titulo:"Cuentas y contraseñas", desc:"Fortalece credenciales, MFA y recuperación.", items: [
    { id:"cuentas-gestor",      t:"Usa un gestor de contraseñas", hint:'<a href="https://www.eff.org/es/wp/PasswordManagers" target="_blank">Guía EFF</a>' },
    { id:"cuentas-mfa",         t:"Activa MFA/TOTP o llave física" },
    { id:"cuentas-14",          t:"Contraseñas largas (≥14) o passphrases" },
    { id:"cuentas-recuperacion",t:"Revisa métodos de recuperación" },
    { id:"cuentas-cierra",      t:"Cierra sesiones en dispositivos que no usas" },
    { id:"cuentas-no-repite",   t:"No reutilices contraseñas entre servicios críticos" },
  ]},
  { catId:"correo", titulo:"Correo y phishing", desc:"Correo seguro y detección de fraudes.", items: [
    { id:"correo-filtros",  t:"Activa filtros antispam y notificaciones de alertas" },
    { id:"correo-dominios", t:"Desconfía de dominios y enlaces sospechosos" },
    { id:"correo-adjuntos", t:"No abras adjuntos desconocidos" },
    { id:"correo-alerta",   t:"Reporta intentos de phishing" },
    { id:"correo-mfa",      t:"Activa MFA también en el correo" },
  ]},
  { catId:"dispositivos", titulo:"Dispositivos", desc:"Actualizaciones, bloqueo y cifrado.", items: [
    { id:"disp-actualiza", t:"Mantén el sistema y apps actualizados" },
    { id:"disp-bloqueo",   t:"Bloqueo por PIN/biometría" },
    { id:"disp-cifrado",   t:"Activa cifrado de disco (BitLocker/FileVault/Android/iOS)" },
    { id:"disp-antimal",   t:"Antimalware/EDR en equipos corporativos" },
    { id:"disp-localiza",  t:"Activa localización/borrado remoto" },
  ]},
  { catId:"navegacion", titulo:"Navegación y privacidad", desc:"Higiene de navegador y rastreo.", items: [
    { id:"nav-actualiza",  t:"Navegador actualizado y extensiones de confianza" },
    { id:"nav-privado",    t:"Usa bloqueo de rastreadores/Modo estricto" },
    { id:"nav-https",      t:"Prefiere HTTPS y revisa candado" },
    { id:"nav-cookies",    t:"Limpia cookies y analiza permisos" },
    { id:"nav-sesion",     t:"Cierra sesión en servicios sensibles" },
  ]},
  { catId:"wifi", titulo:"Redes y Wi-Fi", desc:"Configuración segura de redes.", items: [
    { id:"wifi-wpa3",      t:"WPA2/WPA3 con contraseña fuerte" },
    { id:"wifi-admin",     t:"Cambia la contraseña del admin del router" },
    { id:"wifi-firma",     t:"Actualiza firmware del router" },
    { id:"wifi-guest",     t:"Crea red de invitados separada" },
    { id:"wifi-vpn",       t:"Usa VPN en redes públicas" },
  ]},
  { catId:"nube", titulo:"Nube y compartición", desc:"Controla permisos y enlaces.", items: [
    { id:"nube-permisos",  t:"Permisos mínimos (solo lectura cuando aplique)" },
    { id:"nube-enlaces",   t:"Evita enlaces públicos eternos" },
    { id:"nube-invitar",   t:"Invita por correo a personas específicas" },
    { id:"nube-revoca",    t:"Revisa y revoca acceso periódico" },
    { id:"nube-mfa",       t:"MFA en los servicios en la nube" },
  ]},
  { catId:"backups", titulo:"Copias de seguridad", desc:"Evitar pérdida de datos.", items: [
    { id:"bk-3-2-1",       t:"Aplica la regla 3-2-1" },
    { id:"bk-cifrado",     t:"Cifrado de backups" },
    { id:"bk-pruebas",     t:"Prueba restauraciones periódicas" },
    { id:"bk-programa",    t:"Programa copias automáticas" },
  ]},
  { catId:"mensajeria", titulo:"Mensajería y videollamadas", desc:"Preferir cifrado y validar identidad.", items: [
    { id:"msg-e2e",        t:"Usa apps con cifrado extremo a extremo" },
    { id:"msg-verifica",   t:"Verifica identidad/contactos" },
    { id:"msg-backup",     t:"Cuida los backups de chats (pueden no cifrarse)" },
    { id:"msg-permisos",   t:"Revisa permisos de micrófono/cámara" },
  ]},
  { catId:"social", titulo:"Redes sociales", desc:"Privacidad y autenticación.", items: [
    { id:"soc-privacidad", t:"Configura privacidad del perfil" },
    { id:"soc-2fa",        t:"Activa 2FA/MFA" },
    { id:"soc-enlaces",    t:"Desconfía de enlaces/acortadores" },
    { id:"soc-ubicacion",  t:"Evita publicar ubicación en tiempo real" },
  ]},
  { catId:"compras", titulo:"Compras y pagos", desc:"Protege métodos de pago y tiendas.", items: [
    { id:"pay-2fa",        t:"Activa 2FA en pasarelas/bancos" },
    { id:"pay-tarjeta",    t:"Tarjetas virtuales o límites" },
    { id:"pay-tienda",     t:"Compra solo en tiendas confiables" },
    { id:"pay-alertas",    t:"Activa alertas de transacciones" },
  ]},
  { catId:"incidentes", titulo:"Incidentes y respuesta", desc:"Plan ante phishing, malware, robo.", items: [
    { id:"ir-plan",        t:"Ten un plan de respuesta" },
    { id:"ir-reporta",     t:"Canales de reporte interno" },
    { id:"ir-aislar",      t:"Aislar equipos ante sospecha" },
    { id:"ir-restaurar",   t:"Procedimientos para restaurar desde backups" },
  ]},
  { catId:"familia", titulo:"Familia y niños", desc:"Controles y educación digital.", items: [
    { id:"fam-parental",   t:"Cuentas con controles parentales" },
    { id:"fam-tiempo",     t:"Límites de tiempo y contenido" },
    { id:"fam-privacidad", t:"Privacidad de ubicación y fotos" },
    { id:"fam-estafas",    t:"Advierte sobre estafas y compras integradas" },
    { id:"fam-canales",    t:"Canales abiertos para pedir ayuda" },
  ]},
];

/***** 2) Generación de UI del checklist *****/
const $checklist = document.getElementById('checklist');
function createChecklist() {
  $checklist.innerHTML = '';
  DATA.forEach(cat => {
    const section = document.createElement('section');
    section.className = 'section';
    section.dataset.catId = cat.catId;
    section.innerHTML = `
      <div class="hd">
        <h2>${cat.titulo}</h2>
        <div class="muted">${cat.desc}</div>
        <div class="chip" id="chip-${cat.catId}">0/${cat.items.length} completados</div>
      </div>
      <div class="bd" id="bd-${cat.catId}"></div>
    `;
    $checklist.appendChild(section);
    const body = section.querySelector('.bd');

    cat.items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <input type="checkbox" id="${it.id}" data-item-id="${it.id}" />
        <label for="${it.id}">
          <b>${it.t}</b>
          ${it.hint ? `<div class="hint">${it.hint}</div>` : ''}
        </label>
      `;
      body.appendChild(row);
    });
  });
}

/***** 3) Progreso (local + UI) *****/
const $pBar = document.getElementById('pBar');
const $pLabel = document.getElementById('pLabel');
const $pCount = document.getElementById('pCount');

function allCheckboxes() {
  return [...document.querySelectorAll('#checklist input[type="checkbox"]')];
}
function updateProgressUI() {
  const cbs = allCheckboxes();
  const total = cbs.length;
  const done = cbs.filter(c=>c.checked).length;
  const pct = total ? Math.round((done/total)*100) : 0;
  $pBar.style.width = pct + '%';
  $pLabel.textContent = pct + '%';
  $pCount.textContent = `${done}/${total}`;

  // chips por categoría
  DATA.forEach(cat=>{
    const catCbs = cat.items.map(it=>document.getElementById(it.id));
    const d = catCbs.filter(x=>x?.checked).length;
    const chip = document.getElementById(`chip-${cat.catId}`);
    if (chip) chip.textContent = `${d}/${cat.items.length} completados`;
  });

  drawCharts();
}
function saveLocal() {
  const snapshot = {};
  allCheckboxes().forEach(c => snapshot[c.dataset.itemId] = !!c.checked);
  localStorage.setItem('sdg-progress', JSON.stringify(snapshot));
}
function loadLocal() {
  const raw = localStorage.getItem('sdg-progress');
  if (!raw) return;
  try {
    const snapshot = JSON.parse(raw);
    allCheckboxes().forEach(c => {
      if (snapshot[c.dataset.itemId] != null) c.checked = !!snapshot[c.dataset.itemId];
    });
  } catch(e){}
}

/***** 4) Búsqueda *****/
document.getElementById('search').addEventListener('input', e=>{
  const q = e.target.value.toLowerCase().trim();
  document.querySelectorAll('#checklist .item').forEach(el=>{
    const text = el.innerText.toLowerCase();
    el.style.display = text.includes(q) ? '' : 'none';
  });
});

/***** 5) Modo oscuro *****/
const $btnDark = document.getElementById('btnDark');
function applyTheme() {
  const dark = localStorage.getItem('sdg-theme') === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  $btnDark.textContent = dark ? '☀️ Tema claro' : '🌙 Tema oscuro';
  drawCharts(true);
}
$btnDark.addEventListener('click', ()=>{
  const nowDark = !(localStorage.getItem('sdg-theme') === 'dark');
  localStorage.setItem('sdg-theme', nowDark?'dark':'light');
  applyTheme();
});

/***** 6) Gráficos (Chart.js) *****/
let barChart, pieChart;
function gatherStats() {
  const catLabels = DATA.map(c=>c.titulo);
  const catTotals = DATA.map(c=>c.items.length);
  const catDone   = DATA.map(c=>c.items.filter(it=>document.getElementById(it.id)?.checked).length);
  return {catLabels, catTotals, catDone};
}
function chartColors() {
  const dark = document.documentElement.classList.contains('dark');
  return {
    axis: dark ? '#cfd3dc' : '#374151',
    grid: dark ? '#2b3240' : '#e5e7eb',
    series: [
      '#0ea5e9','#ef4444','#f59e0b','#22c55e','#6366f1',
      '#94a3b8','#a78bfa','#10b981','#f43f5e','#06b6d4','#84cc16','#14b8a6'
    ]
  };
}
function drawCharts(force=false) {
  const {catLabels, catTotals, catDone} = gatherStats();
  const ctxBar = document.getElementById('barCat').getContext('2d');
  const ctxPie = document.getElementById('pieDist').getContext('2d');
  const col = chartColors();

  const perc = catTotals.map((t,i)=> t? Math.round((catDone[i]/t)*100):0);

  if (barChart && force){ barChart.destroy(); barChart=null; }
  if (pieChart && force){ pieChart.destroy(); pieChart=null; }

  if (!barChart){
    barChart = new Chart(ctxBar, {
      type:'bar',
      data:{ labels:catLabels,
        datasets:[{ label:'% completado', data:perc, backgroundColor: col.series }]
      },
      options:{
        scales:{ y:{ suggestedMax:100, ticks:{color:col.axis}, grid:{color:col.grid}},
                 x:{ ticks:{color:col.axis}, grid:{color:col.grid}}},
        plugins:{ legend:{labels:{color:col.axis}} }
      }
    });
  } else {
    barChart.data.labels = catLabels;
    barChart.data.datasets[0].data = perc;
    barChart.update();
  }

  if (!pieChart){
    pieChart = new Chart(ctxPie, {
      type:'doughnut',
      data:{ labels:catLabels, datasets:[{ data:catTotals, backgroundColor: col.series }]},
      options:{ plugins:{ legend:{labels:{color:col.axis}} } }
    });
  } else {
    pieChart.data.labels = catLabels;
    pieChart.data.datasets[0].data = catTotals;
    pieChart.update();
  }
}

/***** 7) Supabase: Auth + sincronización de progreso por usuario *****/
const authModal = document.getElementById('authModal');
const authOpen = document.getElementById('btnOpenAuth');
const authClose = document.getElementById('authClose');
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
const userBox = document.getElementById('userBox');
const userEmail = document.getElementById('userEmail');

authOpen?.addEventListener('click', ()=> authModal.style.display='flex');
authClose?.addEventListener('click', ()=> authModal.style.display='none');
window.addEventListener('click',(e)=>{ if(e.target===authModal) authModal.style.display='none'; });

tabs.forEach(t => t.addEventListener('click', ()=>{
  tabs.forEach(x=>x.classList.remove('active')); panels.forEach(p=>p.classList.remove('active'));
  t.classList.add('active'); document.getElementById('tab-'+t.dataset.tab).classList.add('active');
}));

// Signup
document.getElementById('signupForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPass').value;
  const { error } = await sb.auth.signUp({
    email, password,
    options:{ emailRedirectTo: location.origin + location.pathname }
  });
  if (error) return alert(error.message);
  alert('¡Listo! Revisa tu correo para verificar la cuenta y luego inicia sesión.');
});

// Login
document.getElementById('loginForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);
  authModal.style.display='none';
  await hydrateUserUI();
  await restoreProgressRemote();
  updateProgressUI();
});

document.getElementById('btnLogout')?.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  userBox.style.display='none';
  document.getElementById('btnOpenAuth').style.display='inline-flex';
  // No borramos local; solo dejamos de sincronizar
});

// UI user/email
async function hydrateUserUI(){
  const { data:{ user } } = await sb.auth.getUser();
  if (user){
    userEmail.textContent = user.email ?? 'Usuario';
    userBox.style.display = 'inline-flex';
    document.getElementById('btnOpenAuth').style.display='none';
  }else{
    userBox.style.display='none';
    document.getElementById('btnOpenAuth').style.display='inline-flex';
  }
}

// Sincroniza: sube un item
async function saveRemote(itemId, checked){
  const { data:{ user } } = await sb.auth.getUser();
  if (!user) return; // si no está logueado, no intentamos
  const { error } = await sb.from('progress')
    .upsert({ user_id:user.id, item_id:itemId, checked, updated_at:new Date().toISOString() });
  if (error) console.warn('Supabase upsert error:', error.message);
}

// Trae progreso y pinta
async function restoreProgressRemote(){
  const { data:{ user } } = await sb.auth.getUser();
  if (!user) return;
  const { data, error } = await sb.from('progress')
    .select('item_id, checked').eq('user_id', user.id);
  if (error) { console.warn(error); return; }
  const map = new Map(data.map(r=>[r.item_id, r.checked]));
  allCheckboxes().forEach(cb=>{
    const id = cb.dataset.itemId;
    if (map.has(id)) cb.checked = !!map.get(id);
  });
}

/***** 8) Wiring: eventos *****/
function wireEvents(){
  allCheckboxes().forEach(cb=>{
    cb.addEventListener('change', ()=>{
      saveLocal();
      saveRemote(cb.dataset.itemId, cb.checked);
      updateProgressUI();
    });
  });
}

/***** 9) Boot *****/
document.addEventListener('DOMContentLoaded', async ()=>{
  createChecklist();
  loadLocal();
  wireEvents();
  applyTheme();
  await hydrateUserUI();
  await restoreProgressRemote();
  updateProgressUI();
});
