// ======== SUPABASE ========
const supabase = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// ======== DATOS DEL CHECKLIST (ejemplo corto; añade los tuyos) ========
const CATEGORIES = [
  {
    id: "cuentas",
    title: "Cuentas y contraseñas",
    desc: "Fortalece credenciales, MFA y recuperación.",
    items: [
      { id: "gestor_pass", text: "Usa un gestor de contraseñas", help: "Guía EFF", link: "https://ssd.eff.org" },
      { id: "mfa", text: "Activa MFA/TOTP o llave física" },
      { id: "pass_largas", text: "Contraseñas largas (≥14) o passphrases" },
      { id: "recuperacion", text: "Revisa métodos de recuperación" },
      { id: "cierres_sesiones", text: "Cierra sesiones en dispositivos que no usas" },
      { id: "no_reciclar", text: "No reutilices contraseñas" }
    ]
  },
  // ... agrega el resto de categorías y sus ítems (familia, wifi, copias, etc.)
];

// ======== ESTADO ========
let STATE = {
  user: null,              // { id, email }
  checks: {},              // item_key -> boolean
  totalItems: 0
};

// ======== UI de Sesión ========
const ui = {
  loggedOut: document.getElementById('loggedOut'),
  loggedIn: document.getElementById('loggedIn'),
  whoami: document.getElementById('whoami'),
  btnLogin: document.getElementById('btnLogin'),
  btnRegister: document.getElementById('btnRegister'),
  btnLogout: document.getElementById('btnLogout'),
  email: document.getElementById('authEmail'),
  pass: document.getElementById('authPassword')
};

async function refreshSessionUI() {
  if (STATE.user) {
    ui.loggedOut.style.display = 'none';
    ui.loggedIn.style.display = 'flex';
    ui.whoami.textContent = STATE.user.email;
  } else {
    ui.loggedOut.style.display = 'flex';
    ui.loggedIn.style.display = 'none';
  }
}

ui.btnRegister.addEventListener('click', async () => {
  const { data, error } = await supabase.auth.signUp({
    email: ui.email.value.trim(),
    password: ui.pass.value
  });
  if (error) return alert(error.message);
  alert('Cuenta creada. Revisa tu correo si se solicita confirmación.');
});

ui.btnLogin.addEventListener('click', async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: ui.email.value.trim(),
    password: ui.pass.value
  });
  if (error) return alert(error.message);
  await loadUser();
  await pullProgressFromCloud();
  renderAll();
  alert('Sesión iniciada.');
});

ui.btnLogout.addEventListener('click', async () => {
  await supabase.auth.signOut();
  STATE.user = null;
  refreshSessionUI();
});

// ======== SESIÓN ACTUAL ========
async function loadUser() {
  const { data } = await supabase.auth.getUser();
  STATE.user = data.user ? { id: data.user.id, email: data.user.email } : null;
  await refreshSessionUI();
}

// ======== STORAGE LOCAL (offline) ========
const LS_KEY = "seguridad_delagente_checks";

function loadFromLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) STATE.checks = JSON.parse(raw);
  } catch {}
}

function saveToLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify(STATE.checks));
}

// ======== CLOUD SYNC (Supabase) ========
async function pullProgressFromCloud() {
  if (!STATE.user) return;
  const { data, error } = await supabase
    .from('progress')
    .select('item_key, checked')
    .eq('user_id', STATE.user.id);

  if (error) {
    console.error(error);
    return;
  }
  // mezcla en estado local
  for (const row of data) STATE.checks[row.item_key] = row.checked;
  saveToLocal();
}

async function pushItemToCloud(itemKey, checked) {
  if (!STATE.user) return; // sin sesión: solo local
  const { error } = await supabase
    .from('progress')
    .upsert({
      user_id: STATE.user.id,
      item_key: itemKey,
      checked: !!checked,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,item_key' });
  if (error) console.error('upsert error', error);
}

// ======== RENDER CHECKLIST ========
const root = document.getElementById('checklistRoot');
const progressPct = document.getElementById('progressPct');
const progressCount = document.getElementById('progressCount');
const progressBar = document.getElementById('progressBar');

function renderChecklist() {
  STATE.totalItems = CATEGORIES.reduce((acc, c) => acc + c.items.length, 0);

  let html = '';
  for (const cat of CATEGORIES) {
    html += `
      <section class="card" style="margin:14px 0;">
        <h2>${cat.title}</h2>
        <p>${cat.desc || ''}</p>
        ${cat.items.map(item => {
          const key = `${cat.id}:${item.id}`;
          const checked = !!STATE.checks[key];
          const helpLink = item.link ? `<a href="${item.link}" target="_blank"> ${item.help || 'Guía'}</a>` : '';
          return `
            <label style="display:block;padding:12px;border-bottom:1px dashed #e8e8e8;">
              <input type="checkbox" data-key="${key}" ${checked ? 'checked' : ''} />
              <strong> ${item.text} </strong> ${helpLink}
            </label>
          `;
        }).join('')}
      </section>
    `;
  }
  root.innerHTML = html;

  // eventos
  root.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', async (e) => {
      const key = e.target.dataset.key;
      STATE.checks[key] = e.target.checked;
      saveToLocal();
      await pushItemToCloud(key, e.target.checked);
      renderProgress();
      renderCharts(); // actualiza barras
    });
  });

  renderProgress();
}

function renderProgress() {
  const done = Object.values(STATE.checks).filter(Boolean).length;
  const pct = STATE.totalItems ? Math.round((done / STATE.totalItems) * 100) : 0;
  progressPct.textContent = `${pct}%`;
  progressCount.textContent = `${done}/${STATE.totalItems}`;
  progressBar.style.width = `${pct}%`;
}

// ======== GRÁFICOS ========
let chartCategory, chartDonut;

function buildDatasets() {
  // Avance por categoría (% por categoría)
  const labels = [];
  const dataPct = [];

  for (const cat of CATEGORIES) {
    labels.push(cat.title);
    const total = cat.items.length;
    const done = cat.items.filter(i => STATE.checks[`${cat.id}:${i.id}`]).length;
    dataPct.push(total ? Math.round((done / total) * 100) : 0);
  }

  // Distribución de ítems (cantidad por categoría)
  const itemsPerCat = CATEGORIES.map(c => c.items.length);

  return { labels, dataPct, itemsPerCat };
}

function renderCharts() {
  const { labels, dataPct, itemsPerCat } = buildDatasets();

  // Barra de avance por categoría
  const ctx1 = document.getElementById('chartCategory').getContext('2d');
  if (chartCategory) chartCategory.destroy();
  chartCategory = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: '% completado', data: dataPct }]
    },
    options: {
      responsive: true,
      scales: { y: { suggestedMin: 0, suggestedMax: 100, ticks: { callback: v => v + '%' } } }
    }
  });

  // Donut distribución de ítems
  const ctx2 = document.getElementById('chartDonut').getContext('2d');
  if (chartDonut) chartDonut.destroy();
  chartDonut = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: itemsPerCat }]
    },
    options: { responsive: true, cutout: '60%' }
  });
}

// ======== BÚSQUEDA (simple) ========
document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  // ocultar/mostrar secciones según items que matcheen
  root.querySelectorAll('section.card').forEach(sec => {
    const txt = sec.innerText.toLowerCase();
    sec.style.display = txt.includes(q) ? '' : 'none';
  });
});

// ======== INICIO ========
(async function init() {
  loadFromLocal();
  await loadUser();
  if (STATE.user) await pullProgressFromCloud();
  renderChecklist();
  renderCharts();
  refreshSessionUI();

  // Escucha cambios de sesión (si cambias de cuenta)
  supabase.auth.onAuthStateChange(async (_event, session) => {
    STATE.user = session?.user ? { id: session.user.id, email: session.user.email } : null;
    await refreshSessionUI();
    if (STATE.user) {
      await pullProgressFromCloud();
    }
    renderChecklist();
    renderCharts();
  });
})();
