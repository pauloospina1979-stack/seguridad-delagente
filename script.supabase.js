/***** CONFIG SUPABASE *****/
const SUPABASE_URL  = "https://piqobvnfkglhwkhqzvpe.supabase.co";          // <-- EDITA
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";                        // <-- EDITA
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/***** ADMIN ALLOWLIST (edita las cuentas admin) *****/
const ADMIN_EMAILS = [
  "tu.correo@dominio.com",
  "otro.admin@dominio.com"
];

/***** CATEGORÍAS (id debe coincidir con tu BD) *****/
const CATEGORIES = [
  { id: "auth",   name: "Autenticación",      anchor: "#cat-auth",   icon: "🔐" },
  { id: "emails", name: "Correo seguro",      anchor: "#cat-emails", icon: "✉️" },
  { id: "web",    name: "Navegación segura",  anchor: "#cat-web",    icon: "🌐" },
  { id: "files",  name: "Archivos/Adjuntos",  anchor: "#cat-files",  icon: "📎" },
  { id: "devices",name: "Dispositivos",       anchor: "#cat-dev",    icon: "💻" },
  { id: "privacy",name: "Privacidad/Datos",   anchor: "#cat-priv",   icon: "🛡️" }
];

/***** ESTADO *****/
let currentUser = null;
let charts = {};

/***** UI ELEMENTS *****/
const btnDashboard = document.getElementById("btnDashboard");
const btnChecklist = document.getElementById("btnChecklist");
const btnAdmin = document.getElementById("btnAdmin");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");

const tabDashboard = document.getElementById("tabDashboard");
const tabChecklist = document.getElementById("tabChecklist");
const tabAdmin = document.getElementById("tabAdmin");

const viewDashboard = document.getElementById("viewDashboard");
const viewChecklist = document.getElementById("viewChecklist");
const viewAdmin = document.getElementById("viewAdmin");

const categoriesContainer = document.getElementById("categoriesContainer");

/***** NAV *****/
btnDashboard.onclick = () => switchTab("dashboard");
btnChecklist.onclick  = () => switchTab("checklist");
btnAdmin.onclick      = () => switchTab("admin");

tabDashboard.onclick  = () => switchTab("dashboard");
tabChecklist.onclick  = () => switchTab("checklist");
tabAdmin.onclick      = () => switchTab("admin");

btnLogin.onclick = async () => {
  const email = prompt("Correo:");
  const password = prompt("Contraseña:");
  if (!email || !password) return;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { alert("Error de login: " + error.message); return; }
  currentUser = data.user;
  await afterAuth();
};

btnLogout.onclick = async () => {
  await supabase.auth.signOut();
  currentUser = null;
  updateAuthUI();
  // limpiamos admin
  clearAdmin();
  switchTab("dashboard");
};

/***** INIT *****/
(async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user ?? null;
  updateAuthUI();

  await renderChecklist();         // pinta checklist
  await renderDashboard();         // pinta charts dashboard

  if (isAdmin()) {
    await renderAdmin();           // pinta admin si aplica
  }

  // Deep-link a categoría (si URL tiene hash)
  if (location.hash) {
    switchTab("checklist");
    scrollToAnchor(location.hash);
  }
})();

/***** POST-AUTH *****/
async function afterAuth() {
  updateAuthUI();
  await renderDashboard();
  await renderChecklist();
  if (isAdmin()) await renderAdmin();
}

/***** AUTH UI *****/
function updateAuthUI() {
  if (currentUser) {
    btnLogin.style.display = "none";
    btnLogout.style.display = "inline-block";
    if (isAdmin()) {
      btnAdmin.style.display = "inline-block";
      tabAdmin.style.display = "inline-block";
    } else {
      btnAdmin.style.display = "none";
      tabAdmin.style.display = "none";
    }
  } else {
    btnLogin.style.display = "inline-block";
    btnLogout.style.display = "none";
    btnAdmin.style.display = "none";
    tabAdmin.style.display = "none";
  }
}

/***** CHECK ADMIN *****/
function isAdmin() {
  if (!currentUser || !currentUser.email) return false;
  return ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
}

/***** TABS *****/
function switchTab(which) {
  // tabs
  tabDashboard.classList.remove("active");
  tabChecklist.classList.remove("active");
  tabAdmin.classList.remove("active");

  // views
  viewDashboard.style.display = "none";
  viewChecklist.style.display = "none";
  viewAdmin.style.display = "none";

  if (which === "dashboard") {
    tabDashboard.classList.add("active");
    viewDashboard.style.display = "grid";
  } else if (which === "checklist") {
    tabChecklist.classList.add("active");
    viewChecklist.style.display = "grid";
  } else if (which === "admin") {
    tabAdmin.classList.add("active");
    viewAdmin.style.display = "grid";
  }
}

/***** DASHBOARD *****/
async function renderDashboard() {
  // 1) Avance por categoría (para el usuario actual si está logueado, si no, 0%)
  const catLabels = CATEGORIES.map(c => c.name);
  const catIds    = CATEGORIES.map(c => c.id);

  let catPercents = new Array(CATEGORIES.length).fill(0);

  // leer conteo por categoría para el usuario actual
  if (currentUser) {
    const userId = currentUser.id;

    // Para cada categoría contamos total y completados (usando tus tablas)
    for (let i = 0; i < CATEGORIES.length; i++) {
      const catId = CATEGORIES[i].id;

      // total items en categoría
      const { data: totalItems, error: errT } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("category_id", catId);
      const total = totalItems?.length ?? (errT ? 0 : 0) || (typeof totalItems === "number" ? totalItems : (totalItems?.count || 0));

      // completados por usuario
      const { count: completedCount, error: errC } = await supabase
        .from("progress")
        .select("*", { count: "exact", head: true })
        .eq("category_id", catId)
        .eq("user_id", userId)
        .eq("completed", true);

      const completed = completedCount ?? 0;
      const pct = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
      catPercents[i] = pct;
    }
  }

  // 1A) Barras horizontales con click para navegar a la categoría
  makeOrUpdateHorizontalBar(
    "chartAvanceCat",
    catLabels,
    catPercents,
    (labelIndex) => {
      const cat = CATEGORIES[labelIndex];
      if (!cat) return;
      switchTab("checklist");
      scrollToAnchor(cat.anchor);
    }
  );

  // 2) Distribución tipo malla (radar) conectada al avance real
  makeOrUpdateRadar("chartDistribucion", catLabels, catPercents);

  // 3) Progreso global texto
  const globalPct = Math.round(
    catPercents.reduce((a,b)=>a+b, 0) / Math.max(catPercents.length,1) * 10
  ) / 10;
  const el = document.getElementById("progressGlobal");
  el.textContent = currentUser
    ? `Tu avance global es ${globalPct}%`
    : `Inicia sesión para ver tu avance global.`;
}

/***** CHECKLIST *****/
/* Ejemplo simple que pinta categorías y “items” con checkbox.
   Ajusta si ya tenías items en tu BD. */
async function renderChecklist() {
  categoriesContainer.innerHTML = "";

  for (const cat of CATEGORIES) {
    // Título de categoría con ancla
    const wrap = document.createElement("div");
    wrap.className = "category";
    wrap.id = cat.anchor.substring(1); // quitar '#'

    const title = document.createElement("h4");
    title.innerHTML = `${cat.icon} ${cat.name}`;
    wrap.appendChild(title);

    // Cargar items de la BD
    const { data: items, error } = await supabase
      .from("items")
      .select("id, title, description")
      .eq("category_id", cat.id)
      .order("id", { ascending: true });

    if (error) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No se pudieron cargar los ítems.";
      wrap.appendChild(p);
      categoriesContainer.appendChild(wrap);
      continue;
    }

    // Para cada item, checkbox + título
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "item";

      const left = document.createElement("div");
      left.innerHTML = `<div class="title">${it.title}</div><div class="meta">${it.description ?? ""}</div>`;

      const right = document.createElement("div");
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.disabled = !currentUser; // si no has iniciado sesión, no puedes marcar

      if (currentUser) {
        // traer estado actual
        const { data: prog } = await supabase
          .from("progress")
          .select("completed")
          .eq("user_id", currentUser.id)
          .eq("item_id", it.id)
          .maybeSingle();
        chk.checked = prog?.completed ?? false;

        chk.addEventListener("change", async () => {
          await supabase.from("progress").upsert({
            user_id: currentUser.id,
            item_id: it.id,
            category_id: cat.id,
            completed: chk.checked
          }, { onConflict: "user_id,item_id" });

          // refresca dashboard para reflejar porcentajes
          await renderDashboard();
        });
      }

      right.appendChild(chk);

      row.appendChild(left);
      row.appendChild(right);
      wrap.appendChild(row);
    }

    categoriesContainer.appendChild(wrap);
  }
}

/***** ADMIN PANEL *****/
async function renderAdmin() {
  // Charts
  const global = await supabase.rpc("progress_summary_user_global");
  const byCat  = await supabase.rpc("progress_summary_per_user");

  if (global.error) {
    document.getElementById("adminLegend").textContent = "Error cargando resumen global: " + global.error.message;
    return;
  }
  if (byCat.error) {
    document.getElementById("adminLegend").textContent = "Error cargando detalle por categoría: " + byCat.error.message;
    return;
  }

  const users = (global.data || []).slice(0, 20); // top 20 p/visual
  makeOrUpdateHorizontalBar("chartUsersGlobal",
    users.map(u => u.email || "Sin email"),
    users.map(u => Number(u.pct || 0))
  );

  // Para UsersByCat: agregamos por email y categoría
  const rows = byCat.data || [];
  // Pintar la tabla
  paintAdminTable(rows);

  // Gráfico: promedio por categoría (todos los usuarios)
  const catMap = new Map(); // {category_name -> [pct...]}
  for (const r of rows) {
    const key = r.category_name || r.category_id;
    if (!catMap.has(key)) catMap.set(key, []);
    catMap.get(key).push(Number(r.pct || 0));
  }
  const catNames = Array.from(catMap.keys());
  const catAvg = catNames.map(n => {
    const arr = catMap.get(n);
    const sum = arr.reduce((a,b)=>a+b,0);
    return Math.round((sum/Math.max(arr.length,1))*10)/10;
  });
  makeOrUpdateRadar("chartUsersByCat", catNames, catAvg);

  // Búsqueda por email
  const inp = document.getElementById("searchEmail");
  inp.oninput = () => {
    const term = (inp.value || "").toLowerCase();
    const filtered = rows.filter(r => (r.email || "").toLowerCase().includes(term));
    paintAdminTable(filtered);
  };
}

function clearAdmin() {
  const tbody = document.getElementById("tblAdminBody");
  tbody.innerHTML = "";
  const legend = document.getElementById("adminLegend");
  legend.textContent = "";
  destroyChart("chartUsersGlobal");
  destroyChart("chartUsersByCat");
}

function paintAdminTable(rows) {
  const tbody = document.getElementById("tblAdminBody");
  tbody.innerHTML = "";
  const legend = document.getElementById("adminLegend");
  legend.textContent = `Mostrando ${rows.length} filas`;

  for (const r of rows) {
    const tr = document.createElement("tr");
    const pct = Number(r.pct || 0);

    tr.innerHTML = `
      <td>${r.email || "—"}</td>
      <td>${r.category_name || r.category_id}</td>
      <td>${r.completed_items || 0}</td>
      <td>${r.total_items || 0}</td>
      <td>
        <span class="pill ${pct>=80?"ok":pct>=40?"warn":"err"}">${pct}%</span>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

/***** CHART HELPERS *****/
function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    charts[id] = null;
  }
}

// Barras horizontales + callback en etiqueta
function makeOrUpdateHorizontalBar(canvasId, labels, data, onLabelClick) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  destroyChart(canvasId);

  charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "% completado",
        data,
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, max: 100, ticks: { color: "#a8b3c7" }, grid: { color: "#1b2430" } },
        y: { ticks: { color: "#e7eef6" }, grid: { color: "#1b2430" } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      onClick: (evt, elements) => {
        if (!elements || elements.length === 0) return;
        const idx = elements[0].index;
        if (onLabelClick) onLabelClick(idx);
      }
    }
  });
}

function makeOrUpdateRadar(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  destroyChart(canvasId);

  charts[canvasId] = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "% por categoría",
        data,
        borderWidth: 2,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { color: "#1b2430" },
          grid: { color: "#1b2430" },
          suggestedMin: 0,
          suggestedMax: 100,
          pointLabels: { color: "#e7eef6" },
          ticks: { color: "#a8b3c7", showLabelBackdrop: false }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

/***** UTILS *****/
function scrollToAnchor(hash) {
  const id = hash.startsWith("#") ? hash.substring(1) : hash;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
