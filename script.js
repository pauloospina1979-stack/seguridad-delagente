/*******************************
 * Seguridad DeLaGente – Lógico
 * - Modo claro/oscuro con persistencia
 * - Checklist con progreso
 * - Gráficos (Chart.js) antes del checklist
 *******************************/

/* ===========================
   0) Datos (puedes editar)
   =========================== */

// 👇 Aquí puedes añadir/editar ítems. Si ya tenías un listado más grande,
// simplemente reemplaza el contenido del arreglo CATEGORIES por el tuyo.
const CATEGORIES = [
  {
    name: "Cuentas y contraseñas",
    hint: "Fortalece credenciales, MFA y recuperación.",
    items: [
      { t: "Usa un gestor de contraseñas", d: "Mantén contraseñas únicas y fuertes para cada servicio.", link: "https://ssd.eff.org/es/module/primeros-pasos-con-un-gestor-de-contrasenas" },
      { t: "Activa MFA/TOTP o llave física", d: "Evita SMS si es posible y guarda códigos de recuperación." },
      { t: "Contraseñas largas (≥14) o passphrases", d: "No reutilices contraseñas entre servicios críticos." },
      { t: "Revisa métodos de recuperación", d: "Correo alterno y teléfono vigente bajo tu control." }
    ]
  },
  {
    name: "Correo y phishing",
    hint: "Señales de estafa, adjuntos y remitentes.",
    items: [
      { t: "Desconfía de urgencias y premios", d: "Evita enlaces sospechosos; confirma por otro canal." },
      { t: "Verifica dominio del remitente", d: "Los atacantes imitan nombres; revisa la dirección real." },
      { t: "No abras adjuntos desconocidos", d: "Especialmente .exe, .msi, .js, .scr, .iso." },
      { t: "Reporta correos sospechosos", d: "Usa el canal oficial de tu organización." }
    ]
  },
  {
    name: "Dispositivos",
    hint: "Actualizaciones, bloqueo y cifrado.",
    items: [
      { t: "Mantén el sistema actualizado", d: "Activa actualizaciones automáticas." },
      { t: "Bloqueo con PIN/biometría", d: "Configura bloqueo automático tras inactividad." },
      { t: "Cifrado del disco", d: "BitLocker/FileVault/Android/iOS encendido." },
      { t: "Evita USB desconocidos", d: "Pueden traer malware o BadUSB." }
    ]
  },
  {
    name: "Navegación y privacidad",
    hint: "Rastreo, cookies y permisos.",
    items: [
      { t: "Navegador actualizado", d: "Chrome/Edge/Firefox/Safari al día." },
      { t: "Bloqueo de rastreadores", d: "Activa protección de seguimiento y cookies de terceros." },
      { t: "Revisa permisos de extensiones", d: "Desinstala las que no uses o sean sospechosas." },
      { t: "Usa HTTPS", d: "Evita enviar datos en sitios sin candado/https." }
    ]
  },
  {
    name: "Redes y Wi-Fi",
    hint: "Routers, invitados y públicos.",
    items: [
      { t: "Cambia contraseña de router", d: "Evita contraseñas por defecto." },
      { t: "Actualiza el firmware", d: "Revisa actualizaciones del fabricante." },
      { t: "Red de invitados", d: "Aísla tus dispositivos de IoT/visitantes." },
      { t: "Evita redes públicas sin VPN", d: "No uses banca/correos sensibles en abierto." }
    ]
  },
  {
    name: "Nube y compartición",
    hint: "Enlaces y permisos.",
    items: [
      { t: "Revisa enlaces compartidos", d: "Usa caducidad y solo lectura si aplica." },
      { t: "Carpetas con mínimo privilegio", d: "Solo quien lo necesita." },
      { t: "2FA en tu nube", d: "Google/Microsoft/Dropbox/iCloud, etc." },
      { t: "Evita subir datos sensibles sin cifrar", d: "Considera ZIP/7z con contraseña." }
    ]
  },
  {
    name: "Copias de seguridad",
    hint: "Ransomware y pérdida de datos.",
    items: [
      { t: "Regla 3-2-1", d: "3 copias, 2 medios, 1 fuera de línea o nube." },
      { t: "Prueba restauraciones", d: "Ensaya recuperar un archivo." },
      { t: "Versionado de archivos", d: "Actívalo en tu nube si está disponible." },
      { t: "Protege las copias con contraseña", d: "y acceso restringido." }
    ]
  },
  {
    name: "Mensajería y videollamadas",
    hint: "Privacidad de chats y reuniones.",
    items: [
      { t: "E2EE cuando sea posible", d: "WhatsApp/Signal/Meet con cifrado extremo a extremo." },
      { t: "Revisa grupos y enlaces", d: "Quita participantes desconocidos." },
      { t: "Cuida la pantalla compartida", d: "Cierra ventanas sensibles antes de compartir." },
      { t: "Protege enlaces de reunión", d: "Usa sala de espera o contraseña." }
    ]
  },
  {
    name: "Redes sociales",
    hint: "Perfiles, visibilidad y suplantación.",
    items: [
      { t: "Privacidad del perfil", d: "Limita quién ve tus publicaciones." },
      { t: "Revisión de etiquetado", d: "Aprueba etiquetas antes de publicar." },
      { t: "2FA en redes", d: "Evita que secuestren tu cuenta." },
      { t: "Cuida lo que publicas", d: "Evita datos sensibles (ubicación, documentos)." }
    ]
  },
  {
    name: "Incidentes y respuesta",
    hint: "Qué hacer si algo sale mal.",
    items: [
      { t: "Reconoce señales de compromiso", d: "Computador lento, apps extrañas, alertas AV." },
      { t: "Tienes a mano los contactos", d: "Soporte TI, banco, operador." },
      { t: "Cambia contraseñas comprometidas", d: "Prioriza correo, banco y redes." },
      { t: "Denuncia cuando aplique", d: "Autoridades y soporte oficial." }
    ]
  }
];

/* ===========================
   1) Persistencia y utilidades
   =========================== */

const LS_KEY = "seguridad_delagente_checks_v1";
const THEME_KEY = "seguridad_delagente_theme";

function loadChecks(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function saveChecks(map){ localStorage.setItem(LS_KEY, JSON.stringify(map)); }

function qs(sel,root=document){ return root.querySelector(sel); }
function qsa(sel,root=document){ return Array.from(root.querySelectorAll(sel)); }

/* ===========================
   2) Render checklist
   =========================== */

const state = {
  checks: loadChecks(),
  charts: { byCat: null, dist: null }
};

const listEl = qs("#lista");
const progressTextEl = qs("#progressText");
const progressCountEl = qs("#progressCount");
const progressBarEl = qs("#progressBar");
const searchEl = qs("#search");

function render(){
  listEl.innerHTML = "";
  let total = 0, done = 0;

  CATEGORIES.forEach(cat => {
    const catId = cat.name;
    const filteredItems = (cat.items || []).filter(item => matchesSearch(item));
    total += filteredItems.length;
    const doneCat = filteredItems.reduce((acc, item) => acc + (state.checks[itemId(catId, item.t)] ? 1 : 0), 0);
    done += doneCat;

    const catWrap = document.createElement("section");
    catWrap.className = "category";
    catWrap.setAttribute("aria-label", cat.name);

    const h2 = document.createElement("h2");
    h2.textContent = cat.name;
    catWrap.appendChild(h2);

    const chip = document.createElement("div");
    chip.className = "cat-progress";
    chip.textContent = `${doneCat}/${filteredItems.length} completados`;
    catWrap.appendChild(chip);

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = cat.hint || "";
    catWrap.appendChild(hint);

    filteredItems.forEach(item => {
      const id = itemId(catId, item.t);

      const row = document.createElement("div");
      row.className = "item";
      row.addEventListener("click", e => {
        if(e.target.tagName === "A" || e.target.tagName === "INPUT") return;
        toggleCheck(id);
      });

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!state.checks[id];
      cb.addEventListener("change", () => toggleCheck(id));
      row.appendChild(cb);

      const content = document.createElement("div");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = item.t;
      content.appendChild(title);

      if(item.d){
        const d = document.createElement("div");
        d.className = "desc";
        d.textContent = item.d;
        content.appendChild(d);
      }
      if(item.link){
        const a = document.createElement("a");
        a.href = item.link; a.target = "_blank"; a.rel = "noopener";
        a.textContent = "Guía";
        content.appendChild(a);
      }

      row.appendChild(content);
      catWrap.appendChild(row);
    });

    listEl.appendChild(catWrap);
  });

  // Progreso global
  const pct = total ? Math.round((done/total)*100) : 0;
  progressTextEl.textContent = `Progreso: ${pct}%`;
  progressCountEl.textContent = `(${done}/${total})`;
  progressBarEl.style.width = `${pct}%`;

  // Actualiza gráficos
  drawCharts();
}

function matchesSearch(item){
  const q = (searchEl.value || "").trim().toLowerCase();
  if(!q) return true;
  const hay = [item.t, item.d].join(" ").toLowerCase();
  return hay.includes(q);
}

function itemId(cat, title){
  return `${cat}::${title}`.toLowerCase().replace(/\s+/g,"_");
}

function toggleCheck(id){
  state.checks[id] = !state.checks[id];
  saveChecks(state.checks);
  render();
}

/* ===========================
   3) Gráficos (Chart.js)
   =========================== */

function chartColors(){
  const isDark = document.body.classList.contains("dark");
  return {
    text: getComputedStyle(document.body).getPropertyValue("--text").trim(),
    grid: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    palette: [
      "#3b82f6","#f43f5e","#f59e0b","#22c55e","#06b6d4",
      "#8b5cf6","#9ca3af","#0ea5e9","#ef4444","#14b8a6"
    ]
  };
}

function drawCharts(){
  const ctx1 = qs("#chartProgressByCategory").getContext("2d");
  const ctx2 = qs("#chartItemsDistribution").getContext("2d");
  const colors = chartColors();

  // Datos por categoría
  const labels = [];
  const pctData = [];
  const countData = [];
  CATEGORIES.forEach(cat=>{
    const items = (cat.items||[]);
    const total = items.length;
    const done = items.reduce((a,it)=> a + (state.checks[itemId(cat.name,it.t)]?1:0), 0);
    labels.push(cat.name);
    pctData.push(total? Math.round(100*done/total):0);
    countData.push(total);
  });

  // Destruir si existen
  if(state.charts.byCat) state.charts.byCat.destroy();
  if(state.charts.dist) state.charts.dist.destroy();

  state.charts.byCat = new Chart(ctx1, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "% completado",
        data: pctData,
        backgroundColor: colors.palette.map(c => c + "dd"),
        borderColor: colors.palette,
        borderWidth: 1
      }]
    },
    options: {
      responsive:true,
      scales: {
        y: {
          beginAtZero:true,
          max:100,
          ticks: { color: colors.text },
          grid: { color: colors.grid }
        },
        x: { ticks: { color: colors.text }, grid: { color: colors.grid } }
      },
      plugins:{
        legend:{ labels:{ color: colors.text } },
        tooltip:{ enabled:true }
      }
    }
  });

  state.charts.dist = new Chart(ctx2, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: countData,
        backgroundColor: colors.palette,
        borderColor: chartBorderForTheme(),
        borderWidth: 2
      }]
    },
    options: {
      cutout: "60%",
      plugins:{
        legend:{
          position:"top",
          labels:{ color: colors.text, boxWidth:14 }
        },
        tooltip:{ enabled:true }
      }
    }
  });
}

function chartBorderForTheme(){
  const isDark = document.body.classList.contains("dark");
  return isDark ? "#0f1115" : "#ffffff";
}

/* ===========================
   4) Tema claro/oscuro
   =========================== */

function applyTheme(theme){
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  const btn = qs("#btnTheme");
  btn.textContent = isDark ? "☀️ Tema claro" : "🌙 Tema oscuro";
  // Redibujar gráficos con la nueva paleta
  if(state.charts.byCat || state.charts.dist) drawCharts();
}

function loadTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  if(saved){ applyTheme(saved); return; }
  // Si no hay preferencia, detecta media query
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

qs("#btnTheme").addEventListener("click", ()=>{
  const now = document.body.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, now);
  applyTheme(now);
});

/* ===========================
   5) Búsqueda + inicio
   =========================== */
searchEl.addEventListener("input", ()=>{
  render();
});

// Carga inicial
loadTheme();
render();
