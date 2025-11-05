/*****  CONFIGURA AQUÍ SUPABASE  *****/
const SUPABASE_URL  = "https://piqobvnfkglhwkhqzvpe.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/*****  CATEGORÍAS E ÍTEMS  *****/
/* Puedes agregar/editar aquí. Cada item_id debe ser único. */
const CATEGORIES = [
  {
    id: "auth", name: "Autenticación", icon: "img/icons/auth.svg",
    items: [
      { id: "auth/password_manager", title: "Usa un gestor de contraseñas", desc: "Contraseñas únicas y fuertes por servicio.", link: "https://ssd.eff.org/" },
      { id: "auth/mfa_totp", title: "Activa MFA/TOTP o llave física", desc: "Evita SMS cuando sea posible y guarda códigos de recuperación." },
      { id: "auth/passphrases_14", title: "Contraseñas largas (≥14) o passphrases", desc: "No reutilices contraseñas entre servicios críticos." },
      { id: "auth/recovery_methods", title: "Revisa métodos de recuperación", desc: "Correo alterno y teléfono vigente." },
      { id: "auth/logout_inactive", title: "Cierra sesiones en dispositivos que no usas", desc: "Revisa dispositivos o sesiones activas." },
      { id: "auth/password_change", title: "Cambia contraseñas tras incidentes", desc: "Filtraciones, malware o sospechas de acceso." }
    ]
  },
  {
    id: "web", name: "Navegación web", icon: "img/icons/web.svg",
    items: [
      { id: "web/update_browser", title: "Mantén el navegador actualizado", desc: "Activa actualizaciones automáticas." },
      { id: "web/extensions_minimum", title: "Extensiones necesarias y confiables", desc: "Revisa permisos y elimina las que no uses." },
      { id: "web/https_first", title: "Prioriza HTTPS", desc: "Evita ingresar credenciales en sitios sin candado." }
    ]
  },
  {
    id: "mail", name: "Correo electrónico", icon: "img/icons/mail.svg",
    items: [
      { id: "mail/spam_filters", title: "Activa filtros anti-phishing", desc: "Capacítate para reconocer correos sospechosos." },
      { id: "mail/dkim_dmarc", title: "Verifica remitente/DMARC", desc: "Desconfía de dominios parecidos." }
    ]
  },
  {
    id: "msg", name: "Mensajería", icon: "img/icons/msg.svg",
    items: [
      { id: "msg/e2ee", title: "Usa cifrado de extremo a extremo", desc: "Prefiere apps con E2EE." },
      { id: "msg/verify_contacts", title: "Verifica contactos en transferencias", desc: "Evita suplantación antes de enviar datos." }
    ]
  },
  {
    id: "social", name: "Redes sociales", icon: "img/icons/social.svg",
    items: [
      { id: "social/privacy", title: "Revisa privacidad de perfiles", desc: "Limita visibilidad de datos sensibles." },
      { id: "social/2fa", title: "Activa 2FA en redes", desc: "Protege la cuenta ante robo de contraseña." }
    ]
  },
  {
    id: "net", name: "Redes", icon: "img/icons/net.svg",
    items: [
      { id: "net/wifi_password", title: "Wi-Fi con WPA2/3 y clave fuerte", desc: "Cambia credenciales por defecto." },
      { id: "net/guest_network", title: "Red de invitados separada", desc: "Aísla dispositivos no confiables." }
    ]
  },
  {
    id: "mobile", name: "Dispositivos móviles", icon: "img/icons/mobile.svg",
    items: [
      { id: "mobile/updates", title: "Sistema y apps actualizadas", desc: "Automatiza updates." },
      { id: "mobile/lock", title: "Bloqueo seguro (biometría/PIN)", desc: "Activa borrado remoto si es posible." }
    ]
  },
  {
    id: "pc", name: "PC’s Personales", icon: "img/icons/pc.svg",
    items: [
      { id: "pc/updates", title: "Sistema actualizado", desc: "Parchea vulnerabilidades." },
      { id: "pc/antimalware", title: "Antimalware activo", desc: "Evita software pirata." }
    ]
  },
  {
    id: "finance", name: "Finanzas personales", icon: "img/icons/finance.svg",
    items: [
      { id: "finance/cards", title: "Notificaciones de tarjetas/bancos", desc: "Activa alertas y límites." },
      { id: "finance/phishing", title: "Evita enlaces en correos de bancos", desc: "Escribe la URL manualmente." }
    ]
  },
  {
    id: "human", name: "Aspecto Humano e Ingeniería Social", icon: "img/icons/human.svg",
    items: [
      { id: "human/awareness", title: "Capacitación y simulaciones", desc: "Refuerza el criterio ante fraudes." },
      { id: "human/report", title: "Reporta incidentes temprano", desc: "Baja impacto y tiempos de respuesta." }
    ]
  }
];

/*****  ESTADO  *****/
let SESSION = null;         // auth session
let PROGRESS = new Map();   // key: item_id, value: true/false

/*****  UTIL  *****/
const qs = sel => document.querySelector(sel);
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

/*****  TEMA  *****/
(function initTheme(){
  const saved = localStorage.getItem("theme") || "light";
  if (saved === "dark") document.documentElement.classList.add("dark");
  qs("#btn-theme").textContent = saved === "dark" ? "Tema claro" : "Tema oscuro";
})();
qs("#btn-theme").addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark":"light");
  qs("#btn-theme").textContent = isDark ? "Tema claro" : "Tema oscuro";
});

/*****  AUTH UI  *****/
const authModal = qs("#authModal");
qs("#btn-auth").addEventListener("click", () => authModal.showModal());
qs("#btn-register").addEventListener("click", onRegister);
qs("#btn-login").addEventListener("click", onLogin);

async function onRegister(){
  const email = qs("#email").value.trim();
  const password = qs("#password").value;
  qs("#authMsg").textContent = "Registrando…";
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return qs("#authMsg").textContent = error.message;
  qs("#authMsg").textContent = "Revisa tu correo para confirmar la cuenta.";
}
async function onLogin(){
  const email = qs("#email").value.trim();
  const password = qs("#password").value;
  qs("#authMsg").textContent = "Iniciando sesión…";
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return qs("#authMsg").textContent = error.message;
  authModal.close();
}

supabase.auth.onAuthStateChange((_event, session) => {
  SESSION = session;
  qs("#btn-auth").textContent = session ? "Salir" : "Iniciar sesión";
  qs("#btn-auth").onclick = session ? async () => { await supabase.auth.signOut(); location.reload(); } : () => authModal.showModal();
  if (session) bootstrap();
});

/*****  RENDER BASE  *****/
const checklistEl   = qs("#checklist");
const categoryNavEl = qs("#categoryNav");

function renderCategoryNav(progressByCat){
  categoryNavEl.innerHTML = "";
  for(const cat of CATEGORIES){
    const stats = progressByCat.get(cat.id) || { done:0, total: cat.items.length };
    const pct = Math.round(100 * clamp01(stats.total ? stats.done / stats.total : 0));
    const a = document.createElement("a");
    a.className = "cat";
    a.href = `#cat-${cat.id}`;
    a.innerHTML = `
      <img src="${cat.icon}" alt="" onerror="this.replaceWith(document.createTextNode('📌'))">
      <div class="name">${cat.name}</div>
      <div class="spacer"></div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="pill" style="min-width:60px; text-align:right;">${pct}%</div>
    `;
    categoryNavEl.appendChild(a);
  }
}

function renderChecklist(){
  checklistEl.innerHTML = "";
  for(const cat of CATEGORIES){
    const sec = document.createElement("section");
    sec.id = `cat-${cat.id}`;
    sec.innerHTML = `<h2>${cat.name}</h2>`;
    const box = document.createElement("div");
    for(const it of cat.items){
      const row = document.createElement("div");
      row.className = "item";
      const checked = !!PROGRESS.get(it.id);
      row.innerHTML = `
        <input type="checkbox" ${checked ? "checked":""} data-item="${it.id}" data-cat="${cat.id}">
        <div>
          <div class="item-title">${it.title}</div>
          <div class="muted">${it.desc || ""} ${it.link?`<a href="${it.link}" target="_blank">Guía</a>`:""}</div>
        </div>
      `;
      box.appendChild(row);
    }
    sec.appendChild(box);
    checklistEl.appendChild(sec);
  }
  checklistEl.addEventListener("change", onToggleItem, { once:false });
}

/*****  BUSCADOR  *****/
qs("#search").addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll(".item").forEach(div => {
    const t = div.querySelector(".item-title").textContent.toLowerCase();
    const d = div.querySelector(".muted").textContent.toLowerCase();
    div.style.display = (t.includes(q) || d.includes(q)) ? "" : "none";
  });
});

/*****  PROGRESO  *****/
function computeStats(){
  let total = 0, done = 0;
  const byCat = new Map();
  for(const cat of CATEGORIES){
    const t = cat.items.length;
    const d = cat.items.filter(i => PROGRESS.get(i.id)).length;
    byCat.set(cat.id, { done:d, total:t });
    total += t; done += d;
  }
  const pct = total ? Math.round(100 * done/total) : 0;
  qs("#progress-text").textContent = `${pct}% (${done}/${total})`;
  qs("#progress-bar").style.width = `${pct}%`;
  return { byCat, total, done, pct };
}

/*****  CHARTS  *****/
let chartBars, chartRadar;
function renderCharts(byCat){
  const labels = CATEGORIES.map(c => c.name);
  const values = CATEGORIES.map(c => {
    const s = byCat.get(c.id) || {done:0,total:c.items.length};
    return s.total ? Math.round(100*s.done/s.total) : 0;
  });

  // BARRAS HORIZONTALES
  const ctx1 = document.getElementById("chartBars");
  chartBars?.destroy();
  chartBars = new Chart(ctx1, {
    type: "bar",
    data: { labels, datasets: [{ label: "Avance (%)", data: values }]},
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display:false }, tooltip:{ enabled:true }},
      scales: { x: { min:0, max:100, ticks:{ stepSize:20 }}},
      onClick: (_evt, els) => {
        const e = els[0]; if (!e) return;
        const cat = CATEGORIES[e.index];
        location.hash = `#cat-${cat.id}`;
        document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior:"smooth", block:"start" });
      }
    }
  });

  // RADAR (malla) — mismo avance
  const ctx2 = document.getElementById("chartRadar");
  chartRadar?.destroy();
  chartRadar = new Chart(ctx2, {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "Completado",
        data: values,
        fill: true,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display:false }},
      scales: { r: { min:0, max:100, ticks: { stepSize:25 }}}
    }
  });
}

/*****  HANDLERS  *****/
async function onToggleItem(e){
  const cb = e.target;
  if (cb.tagName !== "INPUT") return;
  const item_id = cb.dataset.item;
  const category_id = cb.dataset.cat;
  const completed = cb.checked;
  PROGRESS.set(item_id, completed);

  // Guardar en Supabase (upsert)
  if (!SESSION) return;
  await supabase.from("progress").upsert(
    [{ user_id: SESSION.user.id, item_id, category_id, completed }],
    { onConflict: "user_id,item_id" }
  );

  // Recalcular y refrescar gráficos + barras de navegación
  const { byCat } = computeStats();
  renderCategoryNav(byCat);
  renderCharts(byCat);
}

/*****  CARGA PROGRESO DEL USUARIO  *****/
async function loadProgress(){
  PROGRESS = new Map();
  if (!SESSION) return;
  const { data, error } = await supabase.from("progress")
    .select("item_id, completed");
  if (!error && data) {
    for(const r of data) PROGRESS.set(r.item_id, !!r.completed);
  }
}

/*****  INICIALIZACIÓN  *****/
function renderShell(){
  renderChecklist();            // pinta items
  const { byCat } = computeStats();
  renderCategoryNav(byCat);     // muestra navegación por categoría con barra
  renderCharts(byCat);          // inicializa gráficos
}

async function bootstrap(){
  await loadProgress();
  renderShell();
}

// Primera carga: si ya hay sesión, bootstrap; si no, pinta shell vacío
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  SESSION = session || null;
  renderShell();
  if (SESSION) bootstrap();
})();

// Botón "Ir al checklist" -> hace scroll
qs("#btn-checklist").addEventListener("click", () => {
  document.getElementById("checklistTop")?.scrollIntoView({ behavior:"smooth", block:"start" });
});
