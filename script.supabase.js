/*************************************************
 *  CONFIGURACIÓN SUPABASE
 *************************************************/
// 1) Rellena con TU URL y TU ANON KEY
const SUPABASE_URL  = "https://piqobvnfkglhwkhqzvpe.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/*************************************************
 *  UTILIDADES UI
 *************************************************/
const $ = (id) => document.getElementById(id);

function log(...a){ console.log("[app]", ...a); }
function warn(...a){ console.warn("[app]", ...a); }
function err(...a){ console.error("[app]", ...a); }

/*************************************************
 *  CHARTS (Chart.js)
 *************************************************/
let barChart, radarChart;

// Paletas por si quieres darle color a cada categoría
const chartColors = [
  "#60a5fa", "#f472b6", "#fbbf24", "#34d399", "#a78bfa",
  "#22d3ee", "#f87171", "#4ade80", "#c084fc", "#38bdf8"
];

// Dibuja / actualiza barras horizontales
function renderBarChart(labels, values) {
  const ctx = $("barChart").getContext("2d");
  if (barChart) barChart.destroy();

  barChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Avance",
        data: values,
        borderWidth: 1,
        backgroundColor: labels.map((_, i) => chartColors[i % chartColors.length])
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (!elements?.length) return;
        const idx = elements[0].index;
        const slug = (labels[idx] || "").toLowerCase()
          .normalize("NFD").replace(/\p{Diacritic}/gu,"")
          .replace(/\s+/g,"-");
        // Navega a checklist (o a secciones particulares si tienes anclas)
        location.hash = "#checklist";
        showTab("tabChecklist");
        // Aquí podrías hacer scroll a la categoría: scrollToCategory(slug);
      },
      scales: {
        x: { min: 0, max: 100, ticks: { stepSize: 20 } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.raw}%` } }
      }
    }
  });
}

// Dibuja / actualiza radar
function renderRadarChart(labels, values) {
  const ctx = $("radarChart").getContext("2d");
  if (radarChart) radarChart.destroy();

  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "Avance",
        data: values,
        borderColor: "rgba(34,197,94,.9)",
        backgroundColor: "rgba(34,197,94,.2)",
        pointBackgroundColor: "rgba(34,197,94,1)",
        pointBorderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          suggestedMin: 0, suggestedMax: 100,
          ticks: { stepSize: 25, showLabelBackdrop: false }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

/*************************************************
 *  DATOS (RPC a Supabase)
 *  Necesita:
 *   - rpc_category_progress(uid uuid)
 *   - rpc_global_progress(uid uuid)
 *  con políticas RLS que permitan seleccionar.
 *************************************************/
async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

async function fetchCategoryProgress(uid) {
  // Cambia "uid" por el nombre exacto del parámetro en tu RPC si difiere
  const { data, error } = await supabase.rpc("rpc_category_progress", { uid });
  if (error) throw error;
  return data || [];
}

async function fetchGlobalProgress(uid) {
  const { data, error } = await supabase.rpc("rpc_global_progress", { uid });
  if (error) throw error;
  // data esperado: { global_progress: 72 } o similar
  return data;
}

/*************************************************
 *  CARGA DEL DASHBOARD
 *************************************************/
async function cargarDashboard() {
  log("Cargando Dashboard...");

  // sesión (puede ser null si aún no inicia sesión)
  const session = await getSession();
  const uid = session?.user?.id ?? null;

  // 1) Avance por categoría
  log("Consultando progreso por categoría...");
  let categories = [];
  try {
    categories = await fetchCategoryProgress(uid);
  } catch (e) {
    err("Error progreso por categoría:", e);
  }

  // Normaliza para gráficos
  const labels = categories.map(c => c.category_name ?? c.category ?? "Categoría");
  const values = categories.map(c => Number(c.progress ?? 0));

  renderBarChart(labels, values);
  renderRadarChart(labels, values);

  // 2) Progreso global
  log("Consultando progreso global...");
  try {
    const g = await fetchGlobalProgress(uid);
    const pct = Math.round(Number(g?.global_progress ?? 0));
    $("globalText").textContent = `Progreso total: ${pct}%`;
  } catch (e) {
    err("Error progreso global:", e);
    $("globalText").textContent = "No se pudo obtener el progreso.";
  }
}

/*************************************************
 *  TABS + AUTH (listeners)
 *************************************************/
function showTab(name) {
  const tabs = ["tabDashboard", "tabChecklist", "tabAdmin"];
  tabs.forEach(t => {
    const n = $(t);
    if (!n) return;
    n.style.display = t === name ? "block" : "none";
  });

  // estado visual de botones
  [["btnDashboard","tabDashboard"],["btnChecklist","tabChecklist"]]
    .forEach(([btnId, tabId]) => {
      const b = $(btnId);
      if (!b) return;
      if (tabId === name) b.classList.add("active");
      else b.classList.remove("active");
    });

  // hash amigable
  if (name === "tabChecklist") location.hash = "#checklist";
  else history.replaceState(null, "", location.pathname);
}

async function updateUI(session) {
  if ($("btnLogin"))  $("btnLogin").style.display  = session ? "none" : "inline-block";
  if ($("btnLogout")) $("btnLogout").style.display = session ? "inline-block" : "none";
  // Cargar siempre dashboard (si tus vistas son públicas funciona sin login)
  try { await cargarDashboard(); } catch(e){ warn(e); }
}

function wireEvents() {
  $("btnDashboard")?.addEventListener("click", (e)=>{ e.preventDefault(); showTab("tabDashboard"); });
  $("btnChecklist")?.addEventListener("click", (e)=>{ e.preventDefault(); showTab("tabChecklist"); });

  $("btnLogin")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href }
      });
    } catch (e) { err("Login error:", e); alert("No fue posible iniciar sesión."); }
  });

  $("btnLogout")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
  });

  // pestaña por hash
  if (location.hash === "#checklist") showTab("tabChecklist");
  else showTab("tabDashboard");
}

/*************************************************
 *  ARRANQUE
 *************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  wireEvents();

  const { data: { session } } = await supabase.auth.getSession();
  await updateUI(session);

  supabase.auth.onAuthStateChange((_evt, sess) => {
    updateUI(sess);
  });
});
