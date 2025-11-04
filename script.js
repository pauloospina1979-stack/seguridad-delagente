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
