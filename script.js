const STATE_KEY = "seguridad-delagente:v1";

const elList = document.getElementById("checklist");
const elSearch = document.getElementById("search");
const elProgress = document.getElementById("progress");

let data = { categories: [] };
let state = loadState();

init();

async function init(){
  const text = await fetch("data/checklist.yml").then(r=>r.text());
  data = jsyaml.load(text);               // { title, categories: [...] }
  render();
  bindSearch();
  updateProgress();
}

function loadState(){
  try{ return JSON.parse(localStorage.getItem(STATE_KEY)||"{}"); }
  catch{ return {}; }
}
function saveState(){ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }

function render(){
  elList.innerHTML = "";
  data.categories.forEach(cat=>{
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <h2>${cat.title}</h2>
      ${cat.description ? `<div class="cat-meta">${cat.description}</div>`:""}
      <div class="items"></div>
    `;
    const itemsEl = card.querySelector(".items");
    cat.items.forEach(it=>{
      const id = `${cat.slug || slug(cat.title)}::${it.slug || slug(it.title)}`;
      const checked = !!state[id];
      const div = document.createElement("label");
      div.className = "item";
      div.innerHTML = `
        <input type="checkbox" ${checked ? "checked":""} data-id="${id}" />
        <div>
          <div><b>${it.title}</b></div>
          ${it.description ? `<small>${it.description}</small>`:""}
          ${it.links?.length ? `<div class="links">${renderLinks(it.links)}</div>`:""}
        </div>
      `;
      div.querySelector("input").addEventListener("change", (e)=>{
        state[id] = e.target.checked;
        saveState();
        updateProgress();
      });
      itemsEl.appendChild(div);
    });
    elList.appendChild(card);
  });
}

function renderLinks(links){
  return links.map(l=>`<small>🔗 <a href="${l.url}" target="_blank" rel="noopener">${l.label||l.url}</a></small>`).join(" ");
}

function updateProgress(){
  const ids = [];
  data.categories.forEach(c=>c.items.forEach(i=>{
    const id = `${c.slug || slug(c.title)}::${i.slug || slug(i.title)}`;
    ids.push(id);
  }));
  const done = ids.filter(id => state[id]).length;
  const pct = ids.length ? Math.round((done/ids.length)*100) : 0;
  elProgress.textContent = `Progreso: ${pct}% (${done}/${ids.length})`;
}

function bindSearch(){
  elSearch.addEventListener("input", ()=>{
    const q = elSearch.value.trim().toLowerCase();
    const cards = [...document.querySelectorAll(".card")];
    cards.forEach(card=>{
      const matches = [...card.querySelectorAll(".item")].map(it=>{
        const text = it.textContent.toLowerCase();
        const hit = text.includes(q);
        it.classList.toggle("hidden", q && !hit);
        return hit;
      });
      const showCard = !q || matches.some(Boolean);
      card.classList.toggle("hidden", !showCard);
    });
  });
}

function slug(s){ return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }
// === Config ===
const YAML_PATH = 'data/checklist.yml';
const STORAGE_KEY = 'delagente-progress-v1';

// === Estado en localStorage ===
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

// === Render del checklist desde YAML ===
async function loadChecklist() {
  const res = await fetch(YAML_PATH);
  const text = await res.text();
  const data = jsyaml.load(text); // { title, categories: [...] }
  return data;
}

// Crea la UI de categorías + ítems con checkboxes
function renderChecklist(data) {
  const container = document.querySelector('#checklist-root');
  if (!container) return; // por si aún no lo tienes en el HTML
  container.innerHTML = '';

  const progress = loadProgress();

  data.categories.forEach(cat => {
    const card = document.createElement('section');
    card.className = 'category-card';

    // Conteo inicial
    const total = cat.items.length;
    const done = cat.items.filter(it => progress[`${cat.slug}:${it.slug}`]).length;

    card.innerHTML = `
      <div class="category-header">
        <h3>${cat.title}</h3>
        <span class="badge">${done}/${total} completados</span>
        <p>${cat.description || ''}</p>
      </div>
      <div class="category-items"></div>
    `;

    const list = card.querySelector('.category-items');

    cat.items.forEach(it => {
      const key = `${cat.slug}:${it.slug}`;
      const checked = !!progress[key];

      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <input type="checkbox" class="item-checkbox" id="${key}" ${checked ? 'checked' : ''}>
        <label for="${key}">
          <strong>${it.title}</strong><br>
          <small>${it.description || ''}</small>
          ${Array.isArray(it.links) ? `
            <div class="links">
              ${it.links.map(l => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join(' · ')}
            </div>` : ''}
        </label>
      `;
      list.appendChild(row);

      // Evento de cambio
      row.querySelector('input').addEventListener('change', (e) => {
        progress[key] = e.target.checked;
        saveProgress(progress);
        // Actualiza badge y gráficos
        const doneNow = cat.items.filter(x => progress[`${cat.slug}:${x.slug}`]).length;
        card.querySelector('.badge').textContent = `${doneNow}/${total} completados`;
        drawCharts(data, progress);
      });
    });

    container.appendChild(card);
  });
}

// === Cálculo de métricas ===
function computeStats(data, progress) {
  const labels = [];
  const totals = [];
  const completed = [];

  data.categories.forEach(cat => {
    labels.push(cat.title);
    const t = cat.items.length;
    totals.push(t);
    const d = cat.items.filter(it => progress[`${cat.slug}:${it.slug}`]).length;
    completed.push(d);
  });

  return { labels, totals, completed };
}

// === Gráficos con Chart.js ===
let chart1, chart2;

function drawCharts(data, progress) {
  const { labels, totals, completed } = computeStats(data, progress);

  // Avance por categoría (porcentaje)
  const pct = completed.map((c, i) => Math.round((c / Math.max(totals[i],1)) * 100));

  const ctx1 = document.getElementById('chartCompletionByCategory');
  if (ctx1) {
    if (chart1) chart1.destroy();
    chart1 = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '% Completado',
          data: pct
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // Distribución de ítems (totales por categoría)
  const ctx2 = document.getElementById('chartItemsDistribution');
  if (ctx2) {
    if (chart2) chart2.destroy();
    chart2 = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: totals }]
      },
      options: { responsive: true }
    });
  }
}

// === Bootstrap ===
(async function init() {
  try {
    const data = await loadChecklist();

    // Título (opcional)
    const h1 = document.querySelector('h1[data-bind="title"]');
    if (h1 && data.title) h1.textContent = data.title;

    renderChecklist(data);
    drawCharts(data, loadProgress());
  } catch (e) {
    console.error('Error cargando checklist:', e);
  }
})();
