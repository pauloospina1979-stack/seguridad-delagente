/*******************************************************
 *  SEGURIDAD DELAGENTE - script.supabase.js
 *  Integración con Supabase (Dashboard y Checklist)
 *******************************************************/

/**********************
 * 1. CONFIGURACIÓN
 **********************/
const SB_URL = "https://piqobvnfkglhwkhqzvpe.supabase.co";     // ⚠️ Reemplaza con tu URL real
const SB_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";                   // ⚠️ Reemplaza con tu anon key

// Cliente Supabase
const supabaseClient = window.supabase.createClient(SB_URL, SB_ANON_KEY);

/**********************
 * 2. SESIÓN DE USUARIO
 **********************/
async function currentUserIdOrNull() {
  try {
    const { data } = await supabaseClient.auth.getUser();
    return data?.user?.id ?? null;
  } catch (error) {
    console.warn("⚠️ No hay sesión activa:", error.message);
    return null;
  }
}

/**********************
 * 3. FUNCIONES RPC
 **********************/
async function fetchCategoryProgress() {
  const uid = await currentUserIdOrNull();
  console.info("📊 Consultando progreso por categoría...");
  const { data, error } = await supabaseClient.rpc("rpc_category_progress", { p_user: uid });
  
  if (error) {
    console.error("❌ Error en rpc_category_progress:", error);
    return [];
  }

  return data.map(r => ({
    slug: r.category_slug,
    name: r.category_name,
    total: r.total_items,
    done: r.completed
  }));
}

async function fetchGlobalProgress() {
  const uid = await currentUserIdOrNull();
  console.info("📈 Consultando progreso global...");
  const { data, error } = await supabaseClient.rpc("rpc_global_progress", { p_user: uid });

  if (error) {
    console.error("❌ Error en rpc_global_progress:", error);
    return { total: 0, done: 0 };
  }

  const row = data?.[0] || { total_items: 0, completed: 0 };
  return { total: row.total_items, done: row.completed };
}

/**********************
 * 4. FUNCIONES DE UI
 **********************/
function drawCategoryBars(categories) {
  const container = document.querySelector("#tabDashboard");
  if (!container) return;

  const canvasId = "chart-categories";
  let canvas = document.getElementById(canvasId);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = canvasId;
    container.appendChild(canvas);
  }

  const labels = categories.map(c => c.name);
  const data = categories.map(c => (c.total ? (c.done / c.total) * 100 : 0));

  new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "% Completado",
        data,
        borderWidth: 1,
        backgroundColor: "rgba(54, 162, 235, 0.6)"
      }]
    },
    options: {
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, max: 100 }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function drawRadar(categories) {
  const container = document.querySelector("#tabDashboard");
  if (!container) return;

  const canvasId = "chart-radar";
  let canvas = document.getElementById(canvasId);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = canvasId;
    container.appendChild(canvas);
  }

  const labels = categories.map(c => c.name);
  const data = categories.map(c => (c.total ? (c.done / c.total) * 100 : 0));

  new Chart(canvas, {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "Avance",
        data,
        borderColor: "#4BC0C0",
        backgroundColor: "rgba(75,192,192,0.2)"
      }]
    },
    options: {
      scales: { r: { beginAtZero: true, max: 100 } }
    }
  });
}

function updateGlobalProgress(global) {
  const progressText = document.querySelector("#progressGlobal");
  if (progressText) {
    const percent = global.total ? Math.round((global.done / global.total) * 100) : 0;
    progressText.textContent = `Progreso global: ${percent}% (${global.done}/${global.total})`;
  }
}

/**********************
 * 5. INICIALIZACIÓN
 **********************/
async function initDashboard() {
  console.info("🚀 Cargando Dashboard...");

  const [cats, global] = await Promise.all([
    fetchCategoryProgress(),
    fetchGlobalProgress()
  ]);

  if (cats.length > 0) {
    drawCategoryBars(cats);
    drawRadar(cats);
  } else {
    console.warn("⚠️ No hay categorías registradas.");
  }

  updateGlobalProgress(global);
}

window.addEventListener("DOMContentLoaded", () => {
  initDashboard().catch(err => console.error("Error inicializando:", err));
});
