// =============================================================
// 🔹 CONFIGURACIÓN SUPABASE (reemplaza con tus datos)
// =============================================================
const SUPABASE_URL = "https://piqobvnfkglhwkhqzvpe.supabase.co"; // <-- reemplaza
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcW9idm5ma2dsaHdraHF6dnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzMwNDYsImV4cCI6MjA3NzkwOTA0Nn0.XQWWrmrEQYom9AtoqLYFyRn6ndzre3miEFEeht9yBkU";           // <-- reemplaza

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =============================================================
// 🔹 UTILIDADES UI
// =============================================================
const $ = (sel) => document.querySelector(sel);
function show(el){ el?.classList?.remove('hidden'); }
function hide(el){ el?.classList?.add('hidden'); }
function setText(el, txt){ if(el) el.textContent = txt; }

// =============================================================
// 🔹 AUTENTICACIÓN: helpers
// =============================================================
async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}
async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}
async function signOut() {
  await supabase.auth.signOut();
  updateAuthUI(null);
  // borro gráficos y progreso
  if (window._barChart) window._barChart.destroy();
  if (window._radarChart) window._radarChart.destroy();
  setText($('#globalProgressText'), '—');
}

async function sendResetPassword(email){
  const redirectTo = location.origin + location.pathname; // vuelve al sitio
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if(error) throw error;
  return data;
}

// =============================================================
// 🔹 OBTENER PROGRESO
// =============================================================
async function fetchProgress() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase.rpc("get_category_progress", { p_user_id: user.id });
    if (error) throw error;

    renderDashboard(data || []);
  } catch (err) {
    console.error("Error al obtener progreso:", err);
  }
}

// =============================================================
// 🔹 RENDER: DASHBOARD (barras horizontales + radar)
// =============================================================
async function renderDashboard(categories) {
  try {
    const cats = Array.isArray(categories) ? categories : [];
    const labels = cats.map(c => c.name ?? "Sin nombre");
    const essential = cats.map(c => Number(c.completed_essential ?? 0));
    const optional  = cats.map(c => Number(c.completed_optional ?? 0));
    const advanced  = cats.map(c => Number(c.completed_advanced ?? 0));
    const percent   = cats.map(c => Number(c.percent ?? 0));

    // --- Barras horizontales ---
    const ctxBar = $("#chartByCategory")?.getContext?.("2d");
    if (ctxBar){
      if (window._barChart) window._barChart.destroy();

      window._barChart = new Chart(ctxBar, {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: "Esencial", data: essential, backgroundColor: "#16a34a" },
            { label: "Opcional", data: optional, backgroundColor: "#f59e0b" },
            { label: "Avanzado", data: advanced, backgroundColor: "#ef4444" },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          plugins: { legend: { position: "bottom" } },
          onClick: (evt, elements) => {
            if (!elements || !elements.length) return;
            const idx = elements[0].index;
            const cat = cats[idx];
            const slug = cat?.slug ?? cat?.name?.toLowerCase().replace(/\s+/g, "-") ?? "categoria";
            location.hash = `#cat-${slug}`;
          },
        },
      });
    }

    // --- Radar ---
    const ctxRadar = $("#chartRadar")?.getContext?.("2d");
    if (ctxRadar){
      if (window._radarChart) window._radarChart.destroy();

      window._radarChart = new Chart(ctxRadar, {
        type: "radar",
        data: {
          labels,
          datasets: [
            {
              label: "Progreso (%)",
              data: percent,
              fill: true,
              backgroundColor: "rgba(59, 130, 246, 0.2)",
              borderColor: "rgba(59, 130, 246, 1)",
              pointBackgroundColor: "rgba(59, 130, 246, 1)",
            },
          ],
        },
        options: {
          responsive: true,
          scales: {
            r: { suggestedMin: 0, suggestedMax: 100, ticks: { stepSize: 25 } },
          },
          plugins: { legend: { position: "bottom" } },
        },
      });
    }

    // --- Progreso global ---
    const avg = percent.length ? Math.round(percent.reduce((a,b)=>a+b,0)/percent.length) : 0;
    setText($("#globalProgressText"), `${avg}% completado`);
  } catch (err) {
    console.error("Error al renderizar dashboard:", err);
  }
}

// =============================================================
// 🔹 CHECKLIST: actualizar progreso
// =============================================================
async function toggleItemProgress(itemId, completed) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert("Por favor inicia sesión.");

    const { error } = await supabase.rpc("upsert_progress", {
      p_user_id: user.id,
      p_item_id: itemId,
      p_completed: completed,
    });
    if (error) throw error;

    fetchProgress(); // refrescar dashboard
  } catch (err) {
    console.error("Error al actualizar progreso:", err);
  }
}

// =============================================================
// 🔹 UI AUTH: eventos y estado
// =============================================================
function updateAuthUI(user){
  const btnOpen = $("#btnOpenLogin");
  const btnLogout = $("#btnLogout");
  if (user){
    hide(btnOpen);
    show(btnLogout);
    hide($("#authModal"));
  } else {
    show(btnOpen);
    hide(btnLogout);
  }
}

function attachAuthEvents(){
  // Abrir / cerrar modal
  $("#btnOpenLogin")?.addEventListener("click", (e)=>{ e.preventDefault(); show($("#authModal")); });
  $("#btnCloseAuth")?.addEventListener("click", ()=> hide($("#authModal")));
  $("#authModal")?.addEventListener("click",(e)=>{ if(e.target.id==="authModal") hide(e.target); });

  // Tabs
  document.querySelectorAll(".auth-tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".auth-tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      if(tab==="login"){ show($("#formLogin")); hide($("#formSignup")); }
      else { show($("#formSignup")); hide($("#formLogin")); }
    });
  });

  // Login
  $("#formLogin")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    setText($("#authLoginMsg"), "");
    const email = $("#loginEmail").value.trim();
    const pass  = $("#loginPassword").value.trim();
    try {
      const user = await signInWithEmail(email, pass);
      updateAuthUI(user);
      fetchProgress();
    } catch (err){
      console.error(err);
      setText($("#authLoginMsg"), err.message || "No se pudo iniciar sesión");
    }
  });

  // Reset password
  $("#btnResetPass")?.addEventListener("click", async (e)=>{
    e.preventDefault();
    const email = prompt("Ingresa tu email para restablecer contraseña:");
    if(!email) return;
    try{
      await sendResetPassword(email);
      alert("Si el correo existe, recibirás un enlace de restablecimiento.");
    }catch(err){
      alert("No se pudo enviar el correo: " + err.message);
    }
  });

  // Signup
  $("#formSignup")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    setText($("#authSignupMsg"), "");
    const email = $("#signupEmail").value.trim();
    const pass  = $("#signupPassword").value.trim();
    try {
      await signUpWithEmail(email, pass);
      setText($("#authSignupMsg"), "Cuenta creada. Revisa tu correo para verificarla.");
    } catch (err){
      console.error(err);
      setText($("#authSignupMsg"), err.message || "No se pudo crear la cuenta");
    }
  });

  // Logout
  $("#btnLogout")?.addEventListener("click", async ()=>{
    await signOut();
  });
}

// =============================================================
// 🔹 INICIALIZACIÓN
// =============================================================
document.addEventListener("DOMContentLoaded", async () => {
  attachAuthEvents();

  // Estado inicial de sesión
  const { data: { user } } = await supabase.auth.getUser();
  updateAuthUI(user || null);
  if (user) fetchProgress();

  // Reaccionar a cambios de sesión
  supabase.auth.onAuthStateChange((evt, session)=>{
    updateAuthUI(session?.user || null);
    if (session?.user) fetchProgress();
  });
});
