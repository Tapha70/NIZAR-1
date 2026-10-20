/**
 * NTV Stock - Application Mobile PWA
 * Nizar Transport Voyageurs - Gestion de stock
 * Version 2.0 - UI/UX refondue avec synchronisation temps réel
 */

"use strict";

// ==================== CONFIGURATION ====================
const API_BASE = "https://nizar-1.onrender.com";
const WS_URL = window.location.origin;
const LS_KEY = 'ntv_stock_v2';
const SYNC_PENDING_KEY = 'ntv_sync_pending';

// ==================== UTILITAIRES ====================
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>\"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function num(n) { return (Number(n) || 0).toLocaleString('fr-FR'); }

function fdate(iso, withTime) {
  const d = new Date(iso);
  const s = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return withTime === false ? s : s + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function localInput(d) {
  d = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function dateInput(d) {
  return localInput(d).slice(0, 10);
}

function sameCode(a, b) {
  return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
}

function catIcon(c) {
  const icons = {
    'Carnets': '📒', 'Billets': '🎫', 'Bons': '🧾',
    'Documents de transport': '📄', 'Fournitures de bureau': '🖊️'
  };
  return icons[c] || '📦';
}

function statusLabel(a) {
  const q = a.quantite || 0;
  const s = a.seuil || 0;
  if (q <= 0) return { k: 'zero', label: 'Rupture', cls: 'b-zero' };
  if (q <= s) return { k: 'low', label: 'Stock bas', cls: 'b-low' };
  return { k: 'ok', label: 'OK', cls: 'b-ok' };
}

// ==================== ÉTAT DE L'APPLICATION ====================
let db = {
  version: 2,
  user: null,
  token: null,
  settings: {
    societe: 'Nizar Transport Voyageurs',
    operateur: '',
    prefixe: 'NTV',
    devise: 'FCFA',
    agences: ['Niamey (Siège)', 'Dosso', 'Maradi', 'Zinder', 'Tahoua', 'Agadez', 'Diffa', 'Tillabéri'],
    categories: ['Carnets', 'Billets', 'Bons', 'Documents de transport', 'Fournitures de bureau'],
    unites: ['Unité', 'Carnet', 'Bloc', 'Paquet', 'Rame', 'Boîte', 'Rouleau', 'Lot'],
    bonSeq: 1,
    ficheSeq: 1,
    printFiche: true
  },
  articles: [],
  mouvements: []
};

let currentSheet = null;
let scanner = { running: false, stream: null, mode: 'consult', onPick: null, lastCode: '', lastTime: 0 };
let overlayStack = [];
let cart = null;

// ==================== API ====================
async function apiRequest(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (db.token) headers['Authorization'] = `Bearer ${db.token}`;

  const response = await fetch(`${API_BASE}/api/${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Erreur HTTP ${response.status}`);
  }

  return response.json();
}

async function apiGet(endpoint) { return apiRequest(endpoint); }
async function apiPost(endpoint, body) { return apiRequest(endpoint, { method: 'POST', body: JSON.stringify(body) }); }
async function apiPut(endpoint, body) { return apiRequest(endpoint, { method: 'PUT', body: JSON.stringify(body) }); }
async function apiDel(endpoint) { return apiRequest(endpoint, { method: 'DELETE' }); }

// ==================== STOCKAGE LOCAL ====================
function saveLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...db, timestamp: Date.now() }));
  } catch (e) { toast('Erreur de stockage local', 'err'); }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.articles) return d;
    }
  } catch (e) {}
  return null;
}

function queueSync(endpoint, method, data) {
  try {
    const pending = JSON.parse(localStorage.getItem(SYNC_PENDING_KEY) || '[]');
    pending.push({ endpoint, method, data, ts: Date.now() });
    localStorage.setItem(SYNC_PENDING_KEY, JSON.stringify(pending));
  } catch (e) {}
}

async function flushSync() {
  if (!navigator.onLine) return false;
  try {
    const pending = JSON.parse(localStorage.getItem(SYNC_PENDING_KEY) || '[]');
    for (const op of pending) {
      await apiRequest(op.endpoint, { method: op.method, body: JSON.stringify(op.data) });
    }
    localStorage.removeItem(SYNC_PENDING_KEY);
    toast('Données synchronisées ☁️', 'ok');
    return true;
  } catch (e) {
    toast('Synchro différée - sera retryée', 'muted');
    return false;
  }
}

// ==================== UI : Toast, Sheet, Overlay ====================
function toast(msg, kind = '') {
  $$('.toast').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function feedback() {
  try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
}

function sheet(title, bodyHtml) {
  if (currentSheet) closeSheet();

  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.innerHTML = `
    <div class="sheet">
      <div class="grab"></div>
      <h3>${esc(title)}<button class="x" onclick="closeSheet()">✕</button></h3>
      ${bodyHtml}
    </div>
  `;
  bd.addEventListener('click', (e) => { if (e.target === bd) closeSheet(); });
  document.body.appendChild(bd);

  const cs = { el: bd, fn: () => { bd.remove(); if (currentSheet === cs) currentSheet = null; } };
  currentSheet = cs;
  overlayStack.push(cs.fn);
  pushHistory(cs.fn);
  return bd.querySelector('.sheet');
}

function closeSheet() {
  if (!currentSheet) return;
  const c = currentSheet;
  currentSheet = null;
  c.fn();
  popHistory();
}

function pushHistory(fn) {
  history.pushState({ ntv: 1 }, '');
  overlayStack.push(fn);
}

function popHistory() {
  const i = overlayStack.length - 1;
  if (i >= 0) overlayStack.splice(i, 1);
}

window.addEventListener('popstate', () => {
  if (overlayStack.length) {
    const fn = overlayStack.pop();
    if (fn) fn();
  }
});

// ==================== RENDU PRINCIPAL ====================
function renderAll() {
  renderHome();
  renderArticles();
  renderMouvements();
}

function renderHome() {
  const A = db.articles.filter((a) => a.actif !== false);
  const totalQ = A.reduce((s, a) => s + (a.quantite || 0), 0);
  const value = A.reduce((s, a) => s + (a.quantite || 0) * (a.prix || 0), 0);
  const alerts = A.filter((a) => statusLabel(a).k !== 'ok');
  const today = new Date().toDateString();
  const todayM = db.mouvements.filter((m) => new Date(m.date).toDateString() === today);

  $('#kpis').innerHTML = `
    <div class="kpi navy"><b>${num(A.length)}</b><span>Articles</span></div>
    <div class="kpi sky"><b>${num(totalQ)}</b><span>Unités en stock${value ? ' · ' + num(value) + ' ' + esc(db.settings.devise) : ''}</span></div>
    <div class="kpi red"><b>${num(alerts.length)}</b><span>Alertes stock</span></div>
    <div class="kpi green"><b>${num(todayM.length)}</b><span>Mouvements aujourd'hui</span></div>
  `;

  $('#home-alerts').innerHTML = alerts.length
    ? alerts.sort((a, b) => a.quantite - b.quantite).slice(0, 8).map(artRow).join('')
    : (A.length ? '<div class="empty"><i>✅</i>Aucun article en stock bas</div>'
      : '<div class="empty"><i>📦</i>Aucun article.<br><br><button class="btn sky block" onclick="app.articleForm()">➕ Créer un article</button></div>');

  const last = db.mouvements.slice(-6).reverse();
  $('#home-mvts').innerHTML = last.length
    ? last.map(mvRow).join('')
    : '<div class="empty"><i>🔄</i>Aucun mouvement</div>';
}

function artRow(a) {
  const st = statusLabel(a);
  return `
    <div class="item" onclick="app.articleSheet('${a._id || a.id}')">
      <div class="ico">${catIcon(a.categorie)}</div>
      <div class="main">
        <div class="t">${esc(a.nom)}</div>
        <div class="s"><span class="tag">${esc(a.code)}</span> · ${esc(a.categorie)}${a.emplacement ? ' · ' + esc(a.emplacement) : ''}</div>
      </div>
      <div class="qty" style="color:${st.k === 'zero' ? 'var(--nizar-red)' : st.k === 'low' ? '#b07a00' : 'var(--nizar-text)'}">
        ${num(a.quantite)}<small>${esc(a.unite)}</small>
      </div>
    </div>`;
}

function mvRow(m) {
  const cls = m.type === 'IN' ? 'b-in' : m.type === 'OUT' ? 'b-out' : 'b-adj';
  const icon = m.type === 'IN' ? '⬇️' : m.type === 'OUT' ? '⬆️' : '⚖️';
  const q = m.type === 'ADJ' ? (m.stockApres - m.stockAvant > 0 ? '+' : '') + num(m.stockApres - m.stockAvant)
    : (m.type === 'IN' ? '+' : '−') + num(m.quantite);
  const who = [m.agence, m.beneficiaire, m.bus].filter(Boolean).join(' · ');
  return `
    <div class="item" onclick="app.mvSheet('${m._id || m.id}')">
      <div class="ico">${icon}</div>
      <div class="main">
        <div class="t">${esc(m.nom)}</div>
        <div class="s">${fdate(m.date)}${who ? ' · ' + esc(who) : ''}${m.serieDu ? ' · N° ' + esc(m.serieDu) + (m.serieAu ? '→' + esc(m.serieAu) : '') : ''}${m.bon ? ' · ' + esc(m.bon) : ''}</div>
      </div>
      <div class="qty"><span class="badge ${cls}">${q}</span><small>stock ${num(m.stockApres)}</small></div>
    </div>`;
}

// ==================== ARTICLES ====================
function renderArticles() {
  const cats = ['Toutes', ...db.settings.categories, '⚠️ Alertes'];
  $('#art-chips').innerHTML = cats.map(c =>
    `<button class="chip ${c === db.artCat ? 'on' : ''}" onclick="app.artCat='${esc(c)}';app.renderArticles()">${c === 'Toutes' || c === '⚠️ Alertes' ? '' : catIcon(c) + ' '}${esc(c)}</button>`
  ).join('');

  const q = ($('#art-search').value || '').trim().toLowerCase();
  const L = db.articles.filter((a) => {
    if (a.actif === false) return false;
    if (db.artCat === '⚠️ Alertes' && statusLabel(a).k === 'ok') return false;
    if (db.artCat !== 'Toutes' && db.artCat !== '⚠️ Alertes' && a.categorie !== db.artCat) return false;
    if (!q) return true;
    return [a.nom, a.code, a.emplacement, a.description].concat(a.alias || []).join(' ').toLowerCase().indexOf(q) >= 0;
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  $('#art-list').innerHTML = L.length ? L.map(artRow).join('') : '<div class="empty"><i>🔍</i>Aucun article trouvé</div>';
}

function articleSheet(id) {
  const a = db.articles.find((x) => (x._id || x.id) === id);
  if (!a) return;
  const st = statusLabel(a);

  sheet(`${catIcon(a.categorie)} ${esc(a.nom)}`, `
    <div class="barcodebox">
      <div style="font-size:11px;font-weight:700;color:var(--nizar-navy);text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:6px">
        ${esc(db.settings.societe)}
      </div>
      <div style="font-weight:700;margin:6px 0">${esc(a.nom)}</div>
      <div style="font-family:monospace;font-size:16px;letter-spacing:2px">${esc(a.code)}</div>
    </div>
    <div class="bigqty"><b>${num(a.quantite)}</b><span>${esc(a.unite)} en stock · <span class="badge ${st.cls}">${st.label}</span></span></div>
    <div class="btngrid">
      <button class="btn green block" onclick="app.mvtForm('${id}','IN')">⬇️ Entrée</button>
      <button class="btn red block" onclick="app.mvtForm('${id}','OUT')">⬆️ Sortie</button>
    </div>
    <dl class="kv">
      <dt>Catégorie</dt><dd>${esc(a.categorie)}</dd>
      <dt>Seuil d'alerte</dt><dd>${num(a.seuil)} ${esc(a.unite)}</dd>
      ${a.emplacement ? '<dt>Emplacement</dt><dd>' + esc(a.emplacement) + '</dd>' : ''}
      ${a.prix ? '<dt>Prix unitaire</dt><dd>' + num(a.prix) + ' ' + esc(db.settings.devise) + '</dd><dt>Valeur</dt><dd>' + num(a.prix * a.quantite) + ' ' + esc(db.settings.devise) + '</dd>' : ''}
      ${(a.alias || []).length ? '<dt>Codes associés</dt><dd>' + (a.alias || []).map(esc).join(', ') + '</dd>' : ''}
    </dl>
    <div class="btngrid">
      <button class="btn light block" onclick="app.labelSheet('${id}')">🏷️ Étiquette</button>
      <button class="btn light block" onclick="app.articleForm('${id}')">✏️ Modifier</button>
      <button class="btn red block" onclick="app.deleteArticle('${id}')">🗑️ Supprimer</button>
    </div>
    <h2>Historique récent</h2>
    <div class="card list">
      ${(db.mouvements.filter((m) => (m.articleId === id || m.articleId === a._id)).slice(-5).reverse().map(mvRow).join('') || '<div class="empty">Aucun mouvement</div>')}
    </div>
  `);
}

function genCode() {
  let code;
  do {
    code = (db.settings.prefixe || 'NTV').toUpperCase() + String(db.settings.seq || 1).padStart(6, '0');
    db.settings.seq = (db.settings.seq || 1) + 1;
  } while (db.articles.find((a) => sameCode(a.code, code)));
  saveLocal();
  return code;
}

function articleForm(id, presetCode) {
  const a = id ? db.articles.find((x) => (x._id || x.id) === id) : null;
  const d = a || {
    code: presetCode || '', nom: '', categorie: db.settings.categories[0],
    unite: db.settings.unites[0], quantite: 0, seuil: 5, emplacement: '', prix: '', description: ''
  };

  sheet(a ? '✏️ Modifier l'article' : '➕ Nouvel article', `
    <form id="art-form" onsubmit="return false">
      <div class="field">
        <label>Code-barres *</label>
        <div class="inputbtn">
          <input name="code" id="f-code" value="${esc(d.code)}" placeholder="Scanner ou générer" autocomplete="off">
          <button type="button" onclick="app.pickCode()">📷 Scanner</button>
          <button type="button" onclick="app.fillGenCode()">⚙️ Générer</button>
        </div>
        <div class="hint">L'article a déjà un code-barres ? Scannez-le. Sinon, générez et imprimez l'étiquette.</div>
      </div>
      <div class="field"><label>Désignation *</label><input name="nom" value="${esc(d.nom)}" placeholder="Ex : Carnet de billets Niamey–Zinder"></div>
      <div class="grid2">
        <div class="field"><label>Catégorie</label><select name="categorie">${db.settings.categories.map((c) => `<option value="${esc(c)}" ${c === d.categorie ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label>Unité</label><select name="unite">${db.settings.unites.map((u) => `<option value="${esc(u)}" ${u === d.unite ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
      </div>
      <div class="grid2">
        ${a ? '' : '<div class="field"><label>Stock initial</label><input name="quantite" type="number" inputmode="numeric" min="0" value="0"></div>'}
        <div class="field"><label>Seuil d'alerte</label><input name="seuil" type="number" inputmode="numeric" min="0" value="${esc(d.seuil)}"></div>
        <div class="field"><label>Prix unitaire (${esc(db.settings.devise)})</label><input name="prix" type="number" inputmode="decimal" min="0" value="${esc(d.prix || '')}"></div>
      </div>
      <div class="field"><label>Emplacement</label><input name="emplacement" value="${esc(d.emplacement)}" placeholder="Ex : Magasin siège – Armoire 1"></div>
      <div class="field"><label>Note</label><textarea name="description" rows="2">${esc(d.description)}</textarea></div>
      <button class="btn sky block" onclick="app.saveArticle('${a ? (a._id || a.id) : 'null'}')">💾 Enregistrer</button>
    </form>
  `);
  if (!a && !presetCode) setTimeout(() => { const n = $('[name=nom]'); if (n) n.focus(); }, 250);
}

function fillGenCode() {
  $('#f-code').value = genCode();
  toast('Code généré : ' + $('#f-code').value, 'ok');
}

function pickCode() {
  scannerOpen('pick', (code) => {
    const i = $('#f-code');
    if (i) { i.value = code; toast('Code scanné : ' + code, 'ok'); }
  });
}

async function saveArticle(id) {
  const f = formData($('#art-form'));
  const code = f.code.trim();
  const nom = f.nom.trim();
  if (!code) return toast('Scannez ou générez un code-barres', 'err');
  if (!nom) return toast('Indiquez la désignation', 'err');

  const other = db.articles.find((a) => sameCode(a.code, code) && (a._id || a.id) !== id);
  if (other) return toast('Ce code est déjà utilisé par : ' + other.nom, 'err');

  const now = new Date().toISOString();
  const data = {
    code: code.toUpperCase(),
    nom,
    categorie: f.categorie,
    unite: f.unite,
    seuil: parseFloat(f.seuil) || 0,
    prix: parseFloat(f.prix) || 0,
    emplacement: f.emplacement.trim(),
    description: f.description.trim(),
    majLe: now,
  };

  if (id) {
    const a = db.articles.find((x) => (x._id || x.id) === id);
    Object.assign(a, data);
    try {
      await apiPut(`articles/${id}`, data);
    } catch (e) { queueSync(`articles/${id}`, 'PUT', data); }
    saveLocal();
    toast('Article modifié', 'ok');
    closeSheet();
    renderAll();
    articleSheet(id);
    return;
  }

  data.quantite = 0;
  data.creeLe = now;
  data.codeGenere = true;

  try {
    const res = await apiPost('articles', data);
    data._id = res.article._id;
    db.articles.push(data);
    saveLocal();
    toast('Article créé ✔', 'ok');
    renderAll();
    if (data.codeGenere) labelSheet(data._id, true);
    else articleSheet(data._id);
  } catch (e) {
    queueSync('articles', 'POST', data);
    data._id = 'local-' + uid();
    db.articles.push(data);
    saveLocal();
    toast('Article créé (synchro différée)', 'muted');
    renderAll();
    articleSheet(data._id);
  }
}

function deleteArticle(id) {
  const a = db.articles.find((x) => (x._id || x.id) === id);
  if (!a) return;
  if (!confirm(`Supprimer « ${a.nom} » ?`)) return;

  db.articles = db.articles.filter((x) => (x._id || x.id) !== id);
  saveLocal();
  closeSheet();
  renderAll();
  toast('Article supprimé');
}

// ==================== MOUVEMENTS ====================
function mvtForm(id, type) {
  const a = db.articles.find((x) => (x._id || x.id) === id);
  if (!a) return;

  sheet(`${catIcon(a.categorie)} ${esc(a.nom)}`, `
    <form id="mv-form" onsubmit="return false">
      <div class="seg">
        <button type="button" class="in ${type === 'IN' ? 'on' : ''}" onclick="app.setMvType('IN')">⬇️ Entrée</button>
        <button type="button" class="out ${type === 'OUT' ? 'on' : ''}" onclick="app.setMvType('OUT')">⬆️ Sortie</button>
      </div>
      <input type="hidden" name="type" id="mv-type" value="${type}">
      <p class="muted" style="margin:0 0 10px;text-align:center">Stock actuel : <b>${num(a.quantite)} ${esc(a.unite)}</b></p>
      <div class="field">
        <label>Quantité (${esc(a.unite)})</label>
        <div class="stepper">
          <button type="button" onclick="app.step(-1)">−</button>
          <input name="quantite" id="mv-qty" type="number" inputmode="numeric" min="0" value="1">
          <button type="button" onclick="app.step(1)">+</button>
        </div>
      </div>
      <div class="grid2">
        <div class="field"><label>Agence</label><select name="agence">${db.settings.agences.map((ag) => `<option value="${esc(ag)}">${esc(ag)}</option>`).join('')}</select></div>
        <div class="field"><label>${type === 'IN' ? 'Fournisseur' : 'Remis à'}</label><input name="beneficiaire" placeholder="Nom"></div>
      </div>
      <div class="field"><label>Motif / observation</label><input name="motif" placeholder="Ex : dotation mensuelle"></div>
      <div class="field"><label>Date</label><input name="date" type="datetime-local" value="${localInput()}"></div>
      <button class="btn ${type === 'IN' ? 'green' : 'red'} block" onclick="app.saveMvt('${id}')">Valider</button>
    </form>
  `);
  setTimeout(() => { const q = $('#mv-qty'); if (q) { q.focus(); q.select(); } }, 250);
}

function setMvType(t) {
  $('#mv-type').value = t;
  $$('#mv-form .seg button').forEach((b) => b.classList.toggle('on', b.classList.contains(t === 'IN' ? 'in' : 'out')));
  const b = $('#mv-form button.btn.block');
  b.className = `btn block ${t === 'IN' ? 'green' : 'red'}`;
  b.textContent = t === 'IN' ? '✔ Valider l'entrée' : '✔ Valider la sortie';
}

function step(d) {
  const i = $('#mv-qty');
  i.value = Math.max(0, (parseFloat(i.value) || 0) + d);
}

async function saveMvt(id) {
  const a = db.articles.find((x) => (x._id || x.id) === id);
  const f = formData($('#mv-form'));
  const q = parseFloat(f.quantite);
  if (!q || q <= 0) return toast('Quantité invalide', 'err');
  if (f.type === 'OUT' && q > a.quantite) return toast('Stock insuffisant', 'err');

  const avant = a.quantite || 0;
  const apres = f.type === 'IN' ? avant + q : f.type === 'OUT' ? avant - q : q;

  const data = {
    articleId: id,
    type: f.type,
    quantite: q,
    stockAvant: avant,
    stockApres: apres,
    agence: f.agence || '',
    beneficiaire: f.beneficiaire || '',
    motif: f.motif || '',
    date: f.date || new Date().toISOString(),
    operateur: db.settings.operateur || '',
  };

  try {
    await apiPost('mouvements', data);
    a.quantite = apres;
    a.majLe = new Date().toISOString();
    saveLocal();
    toast(`${f.type === 'IN' ? 'Entrée' : 'Sortie'} enregistrée · stock : ${num(apres)}`, 'ok');
    closeSheet();
    renderAll();
    if (statusLabel(a).k !== 'ok') setTimeout(() => toast(`⚠️ ${a.nom} : ${statusLabel(a).label}`, 'err'), 1500);
  } catch (e) {
    queueSync('mouvements', 'POST', data);
    a.quantite = apres;
    a.majLe = new Date().toISOString();
    saveLocal();
    toast('Mouvement enregistré (synchro différée)', 'muted');
    closeSheet();
    renderAll();
  }
}

function renderMouvements() {
  const q = ($('#mv-search').value || '').trim().toLowerCase();
  const L = db.mouvements.filter((m) => {
    if (!q) return true;
    return [m.nom, m.code, m.agence, m.beneficiaire, m.motif, m.bon].join(' ').toLowerCase().indexOf(q) >= 0;
  }).reverse();

  $('#mv-list').innerHTML = L.length ? L.slice(0, 200).map(mvRow).join('') : '<div class="empty"><i>🔄</i>Aucun mouvement</div>';
}

function mvSheet(id) {
  const m = db.mouvements.find((x) => (x._id || x.id) === id);
  if (!m) return;
  const cls = m.type === 'IN' ? 'b-in' : m.type === 'OUT' ? 'b-out' : 'b-adj';
  sheet('Détail du mouvement', `
    <dl class="kv">
      <dt>Date</dt><dd>${fdate(m.date)}</dd>
      <dt>Type</dt><dd><span class="badge ${cls}">${m.type === 'IN' ? 'Entrée' : m.type === 'OUT' ? 'Sortie' : 'Ajustement'}</span></dd>
      <dt>Article</dt><dd>${esc(m.nom)}</dd>
      <dt>Code</dt><dd><span class="tag">${esc(m.code)}</span></dd>
      <dt>Quantité</dt><dd>${num(m.quantite)}</dd>
      <dt>Stock avant → après</dt><dd>${num(m.stockAvant)} → ${num(m.stockApres)}</dd>
      <dt>Agence</dt><dd>${esc(m.agence)}</dd>
      <dt>${m.type === 'IN' ? 'Fournisseur' : 'Remis à'}</dt><dd>${esc(m.beneficiaire)}</dd>
      <dt>Motif</dt><dd>${esc(m.motif)}</dd>
      <dt>Opérateur</dt><dd>${esc(m.operateur)}</dd>
      ${m.bon ? '<dt>N° bon</dt><dd>' + esc(m.bon) + '</dd>' : ''}
    </dl>
  `);
}

// ==================== SCANNER ====================
function scannerOpen(mode, onPick) {
  scanner.mode = mode;
  scanner.onPick = onPick || null;
  $('#scanner').classList.remove('hidden');
  $('#scan-title').textContent = mode === 'pick' ? 'Scanner le code de l\'article' : 'Scanner un code-barres';
  scanner.start();
}

function scannerClose() {
  scanner.stop();
  $('#scanner').classList.add('hidden');
}

scanner.start = function () {
  this.running = true;
  const video = $('#scan-video');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('#scan-msg').textContent = '⚠️ Caméra indisponible. Saisissez le code à la main.';
    return;
  }

  if ('BarcodeDetector' in window) {
    BarcodeDetector.getSupportedFormats().then((sup) => {
      const want = ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code'].filter((f) => sup.indexOf(f) >= 0);
      if (want.length) {
        this.detector = new BarcodeDetector({ formats: want });
        startCamera(video);
        return;
      }
      startCamera(video);
    }).catch(() => startCamera(video));
  } else {
    startCamera(video);
  }

  function startCamera(v) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((stream) => {
        if (!scanner.running) { stream.getTracks().forEach((t) => t.stop()); return; }
        scanner.stream = stream;
        v.srcObject = stream;
        return v.play();
      })
      .then(() => {
        if ('BarcodeDetector' in window && scanner.detector) loopNative();
        else loopZX();
      })
      .catch((e) => {
        $('#scan-msg').textContent = '⚠️ Caméra : ' + (e.name === 'NotAllowedError' ? 'autorisez l'accès à la caméra' : 'aucune caméra trouvée') + '. Saisie manuelle disponible.';
      });
  }
};

scanner.stop = function () {
  this.running = false;
  if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
  this.stream = null;
  $('#scan-video').srcObject = null;
  this.detector = null;
};

function loopNative() {
  if (!scanner.running || !scanner.detector) return;
  const v = $('#scan-video');
  if (v.readyState >= 2) {
    scanner.detector.detect(v).then((results) => {
      if (results && results.length) scanner.found(results[0].rawValue);
      setTimeout(loopNative, 100);
    });
  } else setTimeout(loopNative, 100);
}

function loopZX() {
  if (!scanner.running) return;
  const v = $('#scan-video');
  if (v.readyState >= 2 && v.videoWidth && typeof ZXing !== 'undefined') {
    try {
      const c = document.createElement('canvas');
      const vw = v.videoWidth, vh = v.videoHeight;
      const cw = Math.round(vw * 0.9), ch = Math.round(vh * 0.6);
      c.width = cw; c.height = ch;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, cw, ch);
      const hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.QR_CODE]);
      const reader = new ZXing.MultiFormatReader();
      reader.setHints(hints);
      const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c)));
      const res = reader.decodeWithState(bmp);
      if (res) scanner.found(res.getText());
    } catch (e) {}
  }
  setTimeout(loopZX, 120);
}

scanner.found = function (code) {
  code = String(code || '').trim();
  if (!code) return;
  const now = Date.now();
  if (code === this.lastCode && now - this.lastTime < 900) return;
  this.lastCode = code; this.lastTime = now;
  feedback();

  if (this.mode === 'inv') { app.invAdd(code); return; }
  if (this.mode === 'cart') { app.cartScanAdd(code); return; }

  this.close();
  setTimeout(() => {
    if (this.mode === 'pick' && this.onPick) { this.onPick(code); }
    else app.handleScan(code, this.mode);
  }, 30);
};

scanner.close = function () { scannerClose(); };

scanner.manual = function () {
  const v = $('#scan-manual').value.trim();
  if (!v) return;
  $('#scan-manual').value = '';
  this.lastCode = '';
  this.found(v);
};

function handleScan(code, mode) {
  const a = db.articles.find((x) => sameCode(x.code, code) || (x.alias || []).some((c) => sameCode(c, code)));
  if (a) {
    if (mode === 'in') return mvtForm(a._id || a.id, 'IN');
    if (mode === 'out') return mvtForm(a._id || a.id, 'OUT');
    return articleSheet(a._id || a.id);
  }
  sheet('❓ Code inconnu', `
    <div class="barcodebox"><b style="font-size:20px;font-family:monospace">${esc(code)}</b></div>
    <p class="muted" style="margin-top:0">Ce code-barres n'est pas encore enregistré. Créer un article ?</p>
    <button class="btn sky block" style="margin-bottom:10px" onclick="app.articleForm(null,'${esc(code)}')">➕ Créer un nouvel article avec ce code</button>
    <button class="btn ghost block" style="margin-top:10px" onclick="closeSheet();app.openScanner('${mode}')">📷 Scanner un autre code</button>
  `);
}

function openScanner(mode) { scannerOpen(mode); }

// ==================== INVENTAIRE ====================
let inv = {};

function invAdd(code) {
  const a = db.articles.find((x) => sameCode(x.code, code));
  const key = a ? (a._id || a.id) : '?' + code;
  inv[key] = (inv[key] || 0) + 1;
  scanner.msg(a ? `✔ ${a.nom} : ${inv[key]} compté(s)` : `❓ ${code}`);
  renderInv();
}

function renderInv() {
  const keys = Object.keys(inv);
  $('#inv-list').innerHTML = keys.length
    ? keys.map((k) => {
      const a = k[0] === '?' ? null : db.articles.find((x) => (x._id || x.id) === k);
      return `<div><span>${a ? esc(a.nom) : '❓ ' + esc(k.slice(1))}</span><b>${inv[k]}</b></div>`;
    }).join('')
    : '<div><span>Aucun article compté</span><b>0</b></div>';
}

function finishInventory() {
  const keys = Object.keys(inv).filter((k) => k[0] !== '?' && db.articles.find((x) => (x._id || x.id) === k));
  scannerClose();
  setTimeout(() => {
    sheet('📋 Résultat de l'inventaire', `
      <p class="muted" style="margin-top:0">Vérifiez les quantités comptées, puis appliquez.</p>
      <div class="card list" id="inv-res">
        ${keys.map((k) => {
      const a = db.articles.find((x) => (x._id || x.id) === k);
      const diff = inv[k] - a.quantite;
      return `<div class="item" style="cursor:default"><div class="main"><div class="t">${esc(a.nom)}</div><div class="s">Théorique : ${num(a.quantite)} · Écart : <b style="color:${diff ? 'var(--nizar-red)' : 'var(--nizar-green)'}">${diff > 0 ? '+' : ''}${num(diff)}</b></div></div><input data-id="${k}" type="number" inputmode="numeric" min="0" value="${inv[k]}" style="width:80px;padding:8px;border:1px solid var(--nizar-line);border-radius:8px;text-align:center;font-weight:700"></div>`;
    }).join('')}
      </div>
      <div class="row" style="margin-top:14px"><button class="btn ghost" onclick="inv={};closeSheet();toast('Inventaire abandonné')">Abandonner</button><button class="btn green block" onclick="app.applyInventory()">✔ Appliquer</button></div>
    `);
  }, 60);
}

function applyInventory() {
  let n = 0;
  $$('#inv-res input[data-id]').forEach((i) => {
    const a = db.articles.find((x) => (x._id || x.id) === i.dataset.id);
    const q = parseFloat(i.value);
    if (a && !isNaN(q) && q !== a.quantite) {
      a.quantite = q;
      a.majLe = new Date().toISOString();
      n++;
    }
  });
  saveLocal();
  inv = {};
  closeSheet();
  renderAll();
  toast(`Inventaire appliqué · ${n} ajustement(s)`, 'ok');
}

// ==================// BON DE SORTIE ==================
function newCart() {
  return { demandeur: '', fonction: '', agence: db.settings.derniereAgence || '', bus: '', motif: '', lines: [] };
}

function bonForm() {
  if (!cart) cart = newCart();
  const c = cart;
  const lines = c.lines.map((l, i) => {
    const a = db.articles.find((x) => (x._id || x.id) === l.id);
    if (!a) return '';
    const over = (l.q || 0) > a.quantite;
    return `
      <div class="cline">
        <div class="cl-top">
          <div class="ico">${catIcon(a.categorie)}</div>
          <div class="main">
            <div class="t">${esc(a.nom)}</div>
            <div class="s" style="${over ? 'color:var(--nizar-red);font-weight:700' : ''}">Stock : ${num(a.quantite)} ${esc(a.unite)}${over ? ' – insuffisant !' : ''}</div>
          </div>
          <input class="cl-q" type="number" inputmode="numeric" min="0" value="${l.q || 0}" oninput="app.cartSet(${i},'q',this.value)">
          <button type="button" class="cl-x" onclick="app.cartDel(${i})">✕</button>
        </div>
      </div>`;
  }).join('');

  const totalQ = c.lines.reduce((s, l) => s + (l.q || 0), 0);

  sheet('🧾 Bon de sortie', `
    <p class="muted" style="margin-top:0">Plusieurs articles remis à un seul demandeur.</p>
    <div class="field"><label>Demandeur *</label><input value="${esc(c.demandeur)}" oninput="app.cart.demandeur=this.value" placeholder="Nom et prénom"></div>
    <div class="grid2">
      <div class="field"><label>Service / centre</label><input value="${esc(c.fonction)}" oninput="app.cart.fonction=this.value" placeholder="Ex : Centre de Maradi"></div>
      <div class="field"><label>Agence</label><select onchange="app.cart.agence=this.value">${db.settings.agences.map((ag) => `<option value="${esc(ag)}" ${ag === c.agence ? 'selected' : ''}>${esc(ag)}</option>`).join('')}</select></div>
    </div>
    <h2 style="margin-top:4px" id="cart-h">Articles à remettre (${c.lines.length}) · total ${num(totalQ)}</h2>
    <div class="card" style="margin-bottom:10px">${lines || '<div class="empty"><i>🧾</i>Aucun article. Scannez ou ajoutez des articles.</div>'}</div>
    <div class="btngrid" style="margin-bottom:10px">
      <button class="btn amber" onclick="app.cartScan()">📷 Scanner des articles</button>
      <button class="btn light" onclick="$(\\'#cart-pick\\').classList.toggle(\\'hidden\\')">➕ Choisir dans la liste</button>
    </div>
    <div id="cart-pick" class="field hidden">
      <select id="cart-sel">${db.articles.filter((a) => a.actif !== false).sort((x, y) => x.nom.localeCompare(y.nom, 'fr')).map((a) => `<option value="${a._id || a.id}">${esc(a.nom)} (stock ${num(a.quantite)})</option>`).join('')}</select>
      <button type="button" onclick="app.cartAdd($('#cart-sel').value,1);app.bonForm()">Ajouter</button>
    </div>
    <button class="btn red block" onclick="app.cartValidate(true)">✔ Valider la sortie</button>
    <div class="row" style="margin-top:10px"><button class="btn ghost" onclick="app.cartValidate(false)">Valider sans stock check</button><button class="btn ghost" onclick="if(confirm('Vider le bon ?')){cart=null;app.bonForm()}">🗑️ Vider</button></div>
  `);
}

function cartSet(i, k, v) {
  const l = cart.lines[i]; if (!l) return;
  l[k] = k === 'q' ? (parseFloat(v) || 0) : v;
  const h = $('#cart-h');
  if (h && k === 'q') h.textContent = `Articles à remettre (${cart.lines.length}) · total ${num(cart.lines.reduce((s, x) => s + (x.q || 0), 0))}`;
}

function cartDel(i) { cart.lines.splice(i, 1); bonForm(); }

function cartAdd(id, q) {
  if (!cart) cart = newCart();
  const l = cart.lines.find((x) => x.id === id);
  if (l) l.q = (l.q || 0) + q; else cart.lines.push({ id, q, du: '', au: '' });
}

function cartScan() { scannerOpen('cart'); }

function cartScanAdd(code) {
  const a = db.articles.find((x) => sameCode(x.code, code));
  if (!a) { scanner.msg('❓ Code inconnu'); return; }
  cartAdd(a._id || a.id, 1);
  scanner.msg(`✔ ${a.nom} : 1 ajouté`);
}

async function cartValidate(print) {
  if (!cart || !cart.lines.length) return toast('Ajoutez au moins un article', 'err');
  if (!cart.demandeur.trim()) return toast('Indiquez le demandeur', 'err');

  for (const l of cart.lines) {
    const a = db.articles.find((x) => (x._id || x.id) === l.id);
    if (!a) return toast('Article introuvable', 'err');
    if (!(l.q > 0)) return toast('Quantité invalide : ' + a.nom, 'err');
    if (l.q > a.quantite) return toast('Stock insuffisant : ' + a.nom, 'err');
  }

  const bon = `BS-${new Date().getFullYear()}-${String(db.settings.bonSeq++).padStart(4, '0')}`;
  const date = new Date().toISOString();

  try {
    for (const l of cart.lines) {
      const a = db.articles.find((x) => (x._id || x.id) === l.id);
      const avant = a.quantite;
      const apres = avant - l.q;
      await apiPost('mouvements', {
        articleId: l.id, type: 'OUT', quantite: l.q, stockAvant: avant, stockApres: apres,
        agence: cart.agence, beneficiaire: cart.demandeur, fonction: cart.fonction, bus: cart.bus,
        motif: cart.motif, bon, operateur: db.settings.operateur, date
      });
      a.quantite = apres;
      a.majLe = date;
    }
    db.settings.bonSeq++;
    saveLocal();
    cart = null;
    closeSheet();
    renderAll();
    toast(`Bon ${bon} enregistré`, 'ok');
  } catch (e) {
    queueSync('mouvements', 'POST', { bon, lignes: cart.lines, date });
    cart = null;
    closeSheet();
    renderAll();
    toast('Bon enregistré (synchro différée)', 'muted');
  }
}

// ==================== PARAMÈTRES ====================
function settingsForm() {
  const S = db.settings;
  sheet('⚙️ Paramètres', `
    <form id="set-form" onsubmit="return false">
      <div class="field"><label>Nom de la société</label><input name="societe" value="${esc(S.societe)}"></div>
      <div class="field"><label>Opérateur</label><input name="operateur" value="${esc(S.operateur)}" placeholder="Votre nom"></div>
      <div class="grid2">
        <div class="field"><label>Préfixe codes</label><input name="prefixe" value="${esc(S.prefixe)}" maxlength="6"></div>
        <div class="field"><label>Devise</label><input name="devise" value="${esc(S.devise)}"></div>
      </div>
      <div class="field"><label>Agences (une par ligne)</label><textarea name="agences" rows="4">${esc(S.agences.join('\n'))}</textarea></div>
      <div class="field"><label>Catégories (une par ligne)</label><textarea name="categories" rows="4">${esc(S.categories.join('\n'))}</textarea></div>
      <button class="btn sky block" onclick="app.saveSettings()">💾 Enregistrer</button>
    </form>
  `);
}

function saveSettings() {
  const f = formData($('#set-form'));
  const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  db.settings.societe = f.societe.trim() || 'Nizar Transport Voyageurs';
  db.settings.operateur = f.operateur.trim();
  db.settings.prefixe = (f.prefixe.trim() || 'NTV').toUpperCase();
  db.settings.devise = f.devise.trim() || 'FCFA';
  db.settings.agences = lines(f.agences);
  db.settings.categories = lines(f.categories);
  db.settings.unites = lines(f.unites);
  saveLocal();
  closeSheet();
  renderAll();
  toast('Paramètres enregistrés', 'ok');
}

// ==================// SYNCHRONISATION ==================
async function syncData() {
  if (!navigator.onLine) return toast('Pas de connexion réseau', 'err');
  try {
    toast('Synchronisation…', 'sky');
    await flushSync();
    // Pull depuis le serveur
    const data = await apiGet('sync/pull');
    db.articles = data.articles || db.articles;
    db.mouvements = data.mouvements || db.mouvements;
    db.settings = data.settings || db.settings;
    saveLocal();
    renderAll();
    toast('Synchronisation terminée ☁️', 'ok');
  } catch (e) {
    toast('Erreur de synchronisation', 'err');
  }
}

// ==================// FORM DATA HELPER ==================
function formData(root) {
  const o = {};
  $$('[name]', root).forEach((el) => {
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return o;
}

// ==================// ÉTIQUETTES ==================
function labelSheet(id, justCreated) {
  const a = db.articles.find((x) => (x._id || x.id) === id);
  if (!a) return;
  sheet('🏷️ Étiquette', `
    ${justCreated ? '<p class="note">✅ Article créé. Imprimez l\'étiquette et collez-la sur l\'article.</p>' : ''}
    <div class="barcodebox">
      <div style="font-size:11px;font-weight:700;color:var(--nizar-navy);text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:6px">${esc(db.settings.societe)}</div>
      <div style="font-weight:700;margin:6px 0">${esc(a.nom)}</div>
      <div style="font-family:monospace;font-size:18px;letter-spacing:3px">${esc(a.code)}</div>
    </div>
    <div class="field"><label>Nombre d'étiquettes</label><input id="lab-n" type="number" min="1" value="1"></div>
    <div class="btngrid">
      <button class="btn sky block" onclick="window.print()">🖨️ Imprimer</button>
      <button class="btn light block" onclick="app.articleSheet('${id}')">Voir l'article</button>
    </div>
  `);
}

// ==================// INITIALISATION ==================
const app = {
  view: 'home',
  artCat: 'Toutes',
  init: async function () {
    // Charger données locales
    const local = loadLocal();
    if (local) {
      db = { ...db, ...local, articles: local.articles || [], mouvements: local.mouvements || [] };
    }

    // Vérifier connexion et sync
    if (navigator.onLine) {
      try {
        await syncData();
      } catch (e) {
        console.log('Mode hors-ligne, données locales utilisées');
      }
    }

    renderAll();

    // Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // Écouter reconnexion
    window.addEventListener('online', () => syncData());
  },
  go: function (v) {
    this.view = v;
    $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
    $$('.nav button[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    window.scrollTo(0, 0);
    renderAll();
  },
  renderAll,
  renderHome,
  renderArticles,
  renderMouvements,
  articleSheet,
  articleForm,
  fillGenCode,
  pickCode,
  saveArticle,
  deleteArticle,
  mvtForm,
  setMvType,
  step,
  saveMvt,
  mvSheet,
  openScanner,
  handleScan,
  scannerOpen,
  scannerClose,
  invAdd,
  renderInv,
  finishInventory,
  applyInventory,
  bonForm,
  cartSet,
  cartDel,
  cartAdd,
  cartScan,
  cartScanAdd,
  cartValidate,
  settingsForm,
  saveSettings,
  syncData,
  labelSheet,
  genCode,
};

// Exposer globalement
window.app = app;
window.Scanner = scanner;
window.openScanner = openScanner;
window.closeSheet = closeSheet;

// Démarrage
window.addEventListener('DOMContentLoaded', () => app.init());