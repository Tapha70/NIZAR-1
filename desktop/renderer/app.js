/**
 * NTV Stock Desktop - Application Windows
 * Logique métier partagée avec la version mobile
 */

"use strict";

const API_BASE = window.location.origin; // Se connecte au même backend
const electronAPI = window.electronAPI || {};

let db = {
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
  },
  articles: [],
  mouvements: [],
  artCat: 'Toutes',
};

let currentSheet = null;
let cart = null;

// ==================== API ====================
async function apiRequest(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (db.token) headers['Authorization'] = `Bearer ${db.token}`;
  const res = await fetch(`${API_BASE}/api/${endpoint}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}
const apiGet = (e) => apiRequest(e);
const apiPost = (e, b) => apiRequest(e, { method: 'POST', body: JSON.stringify(b) });
const apiPut = (e, b) => apiRequest(e, { method: 'PUT', body: JSON.stringify(b) });

// ==================== UTILS ====================
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function num(n) { return (Number(n) || 0).toLocaleString('fr-FR'); }
function fdate(iso, wt) {
  const d = new Date(iso);
  const s = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return wt === false ? s : s + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function catIcon(c) {
  const i = { 'Carnets': '📒', 'Billets': '🎫', 'Bons': '🧾', 'Documents de transport': '📄', 'Fournitures de bureau': '🖊️' };
  return i[c] || '📦';
}
function statusLabel(a) {
  const q = a.quantite || 0, s = a.seuil || 0;
  if (q <= 0) return { k: 'zero', label: 'Rupture', cls: 'b-zero' };
  if (q <= s) return { k: 'low', label: 'Stock bas', cls: 'b-low' };
  return { k: 'ok', label: 'OK', cls: 'b-ok' };
}
function formData(root) {
  const o = {};
  $$('[name]', root).forEach((el) => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
  return o;
}

// ==================== SHEETS ====================
function sheet(title, html) {
  if (currentSheet) closeSheet();
  const container = $('#sheet-container');
  container.innerHTML = `
    <div class="backdrop" onclick="if(event.target===this) closeSheet()">
      <div class="sheet">
        <div class="grab"></div>
        <h3>${esc(title)} <button class="x" onclick="closeSheet()">✕</button></h3>
        ${html}
      </div>
    </div>`;
  container.classList.remove('hidden');
  currentSheet = true;
  return container.querySelector('.sheet');
}
function closeSheet() {
  $('#sheet-container').classList.add('hidden');
  currentSheet = null;
}

// ==================== RENDU ====================
function renderAll() {
  renderHome();
  renderArticles();
  renderMouvements();
}

function renderHome() {
  const A = db.articles;
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
    : '<div class="empty"><i>✅</i>Aucune alerte de stock</div>';

  $('#home-mvts').innerHTML = db.mouvements.slice(-6).reverse().map(mvRow).join('') || '<div class="empty"><i>🔄</i>Aucun mouvement</div>';
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
      <div class="qty">${num(a.quantite)}<small>${esc(a.unite)}</small></div>
    </div>`;
}

function mvRow(m) {
  const cls = m.type === 'IN' ? 'b-in' : m.type === 'OUT' ? 'b-out' : 'b-adj';
  const icon = m.type === 'IN' ? '⬇️' : m.type === 'OUT' ? '⬆️' : '⚖️';
  return `
    <div class="item" onclick="app.mvSheet('${m._id || m.id}')">
      <div class="ico">${icon}</div>
      <div class="main">
        <div class="t">${esc(m.nom)}</div>
        <div class="s">${fdate(m.date)} · ${esc(m.agence || '')} ${esc(m.beneficiaire || '')}</div>
      </div>
      <div class="qty"><span class="badge ${cls}">${m.type === 'IN' ? '+' : '−'}${num(m.quantite)}</span><small>stock ${num(m.stockApres)}</small></div>
    </div>`;
}

function renderArticles() {
  const cats = ['Toutes', ...db.settings.categories, '⚠️ Alertes'];
  $('#art-chips').innerHTML = cats.map(c =>
    `<button class="chip ${c === db.artCat ? 'on' : ''}" onclick="app.artCat='${esc(c)}';app.renderArticles()">${esc(c)}</button>`
  ).join('');

  const q = ($('#art-search').value || '').trim().toLowerCase();
  const L = db.articles.filter((a) => {
    if (db.artCat === '⚠️ Alertes' && statusLabel(a).k === 'ok') return false;
    if (db.artCat !== 'Toutes' && db.artCat !== '⚠️ Alertes' && a.categorie !== db.artCat) return false;
    if (!q) return true;
    return [a.nom, a.code, a.emplacement].join(' ').toLowerCase().indexOf(q) >= 0;
  });

  $('#art-table-body').innerHTML = L.map((a) => {
    const st = statusLabel(a);
    return `
      <tr>
        <td><span class="tag mono">${esc(a.code)}</span></td>
        <td>${esc(a.nom)}</td>
        <td>${esc(a.categorie)}</td>
        <td>${num(a.quantite)}</td>
        <td>${num(a.seuil)}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        <td>
          <button class="btn light" style="padding:6px 10px;font-size:12px" onclick="app.articleSheet('${a._id || a.id}')">Voir</button>
          <button class="btn ghost" style="padding:6px 10px;font-size:12px;color:var(--nizar-red)" onclick="app.deleteArticle('${a._id || a.id}')">Supprimer</button>
        </td>
      </tr>`;
  }).join('');
}

function renderMouvements() {
  const q = ($('#mv-search').value || '').trim().toLowerCase();
  const L = db.mouvements.filter((m) => {
    if (!q) return true;
    return [m.nom, m.code, m.agence, m.beneficiaire].join(' ').toLowerCase().indexOf(q) >= 0;
  }).reverse();

  $('#mv-table-body').innerHTML = L.map((m) => {
    const cls = m.type === 'IN' ? 'b-in' : m.type === 'OUT' ? 'b-out' : 'b-adj';
    return `
      <tr>
        <td>${fdate(m.date)}</td>
        <td><span class="badge ${cls}">${m.type === 'IN' ? 'Entrée' : m.type === 'OUT' ? 'Sortie' : 'Ajustement'}</span></td>
        <td>${esc(m.nom)}</td>
        <td class="mono">${esc(m.code)}</td>
        <td>${num(m.quantite)}</td>
        <td>${num(m.stockApres)}</td>
        <td>${esc(m.agence || '')}</td>
        <td>${esc(m.operateur || '')}</td>
      </tr>`;
  }).join('');
}

// ==================== ARTICLES ====================
function articleSheet(id) {
  const a = db.articles.find((x) => (x._id || x.id) === id);
  if (!a) return;
  const st = statusLabel(a);
  sheet(`${catIcon(a.categorie)} ${esc(a.nom)}`, `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-family:monospace;font-size:18px;letter-spacing:3px;font-weight:700">${esc(a.code)}</div>
    </div>
    <div class="grid2">
      <div class="field"><label>Stock actuel</label><input type="number" value="${a.quantite}" disabled></div>
      <div class="field"><label>Seuil d'alerte</label><input type="number" value="${a.seuil}" disabled></div>
      <div class="field"><label>Prix unitaire</label><input type="number" value="${a.prix || 0}" disabled></div>
      <div class="field"><label>Catégorie</label><input type="text" value="${esc(a.categorie)}" disabled></div>
    </div>
    <div class="field"><label>Emplacement</label><input type="text" value="${esc(a.emplacement || '')}" disabled></div>
    <div class="field"><label>Description</label><textarea disabled>${esc(a.description || '')}</textarea></div>
    <div class="btngrid" style="margin-top:16px">
      <button class="btn green block" onclick="app.mvtForm('${id}','IN')">⬇️ Entrée</button>
      <button class="btn red block" onclick="app.mvtForm('${id}','OUT')">⬆️ Sortie</button>
    </div>
    <div class="btngrid" style="margin-top:10px">
      <button class="btn light block" onclick="app.articleForm('${id}')">✏️ Modifier</button>
      <button class="btn red block" onclick="app.deleteArticle('${id}')">🗑️ Supprimer</button>
    </div>
  `);
}

function articleForm(id) {
  const a = id ? db.articles.find((x) => (x._id || x.id) === id) : null;
  const d = a || { code: '', nom: '', categorie: db.settings.categories[0], unite: db.settings.unites[0], quantite: 0, seuil: 5, prix: '', emplacement: '', description: '' };
  sheet(a ? '✏️ Modifier l'article' : '➕ Nouvel article', `
    <form id="art-form" onsubmit="return false">
      <div class="field"><label>Code-barres *</label><input name="code" value="${esc(d.code)}"></div>
      <div class="field"><label>Désignation *</label><input name="nom" value="${esc(d.nom)}"></div>
      <div class="grid2">
        <div class="field"><label>Catégorie</label><select name="categorie">${db.settings.categories.map(c => `<option ${c === d.categorie ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label>Unité</label><select name="unite">${db.settings.unites.map(u => `<option ${u === d.unite ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Quantité</label><input name="quantite" type="number" value="${a ? a.quantite : 0}"></div>
        <div class="field"><label>Seuil</label><input name="seuil" type="number" value="${d.seuil}"></div>
        <div class="field"><label>Prix (${esc(db.settings.devise)})</label><input name="prix" type="number" value="${d.prix || ''}"></div>
      </div>
      <div class="field"><label>Emplacement</label><input name="emplacement" value="${esc(d.emplacement || '')}"></div>
      <div class="field"><label>Description</label><textarea name="description">${esc(d.description || '')}</textarea></div>
      <button class="btn sky block" onclick="app.saveArticle('${a ? (a._id || a.id) : 'null'}')">💾 Enregistrer</button>
    </form>
  `);
}

async function saveArticle(id) {
  const f = formData($('#art-form'));
  if (!f.code || !f.nom) return toast('Code et nom requis', 'err');
  const data = { code: f.code.toUpperCase(), nom: f.nom, categorie: f.categorie, unite: f.unite, quantite: parseFloat(f.quantite) || 0, seuil: parseFloat(f.seuil) || 5, prix: parseFloat(f.prix) || 0, emplacement: f.emplacement, description: f.description, majLe: new Date().toISOString() };
  try {
    if (id) {
      await apiPut(`articles/${id}`, data);
      const a = db.articles.find((x) => (x._id || x.id) === id);
      Object.assign(a, data);
    } else {
      const res = await apiPost('articles', data);
      data._id = res.article._id;
      db.articles.push(data);
    }
    closeSheet();
    renderAll();
    toast('Article enregistré', 'ok');
  } catch (e) { toast('Erreur: ' + e.message, 'err'); }
}

function deleteArticle(id) {
  if (!confirm('Supprimer cet article ?')) return;
  db.articles = db.articles.filter((x) => (x._id || x.id) !== id);
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
        <button type="button" class="${type === 'IN' ? 'on' : ''}" onclick="app.setMvType('IN')">⬇️ Entrée</button>
        <button type="button" class="${type === 'OUT' ? 'on' : ''}" onclick="app.setMvType('OUT')">⬆️ Sortie</button>
      </div>
      <input type="hidden" name="type" value="${type}">
      <p class="muted" style="text-align:center">Stock actuel : <b>${num(a.quantite)} ${esc(a.unite)}</b></p>
      <div class="field"><label>Quantité</label><input name="quantite" type="number" min="0" value="1"></div>
      <div class="grid2">
        <div class="field"><label>Agence</label><select name="agence">${db.settings.agences.map(ag => `<option>${esc(ag)}</option>`).join('')}</select></div>
        <div class="field"><label>${type === 'IN' ? 'Fournisseur' : 'Remis à'}</label><input name="beneficiaire"></div>
      </div>
      <div class="field"><label>Motif</label><input name="motif"></div>
      <button class="btn ${type === 'IN' ? 'green' : 'red'} block" onclick="app.saveMvt('${id}')">Valider</button>
    </form>
  `);
}

function setMvType(t) {
  $$('#mv-form .seg button').forEach((b) => b.classList.toggle('on', (t === 'IN' && b.textContent.includes('Entrée')) || (t === 'OUT' && b.textContent.includes('Sortie'))));
}

async function saveMvt(id) {
  const a = db.articles.find((x) => (x._id || x.id) === id);
  const f = formData($('#mv-form'));
  const q = parseFloat(f.quantite);
  if (!q || q <= 0) return toast('Quantité invalide', 'err');
  if (f.type === 'OUT' && q > a.quantite) return toast('Stock insuffisant', 'err');

  const avant = a.quantite;
  const apres = f.type === 'IN' ? avant + q : avant - q;

  try {
    await apiPost('mouvements', {
      articleId: id, type: f.type, quantite: q, stockAvant: avant, stockApres: apres,
      agence: f.agence, beneficiaire: f.beneficiaire, motif: f.motif,
      operateur: db.settings.operateur, date: new Date().toISOString()
    });
    a.quantite = apres;
    a.majLe = new Date().toISOString();
    closeSheet();
    renderAll();
    toast('Mouvement enregistré', 'ok');
  } catch (e) { toast('Erreur: ' + e.message, 'err'); }
}

function mvSheet(id) {
  const m = db.mouvements.find((x) => (x._id || x.id) === id);
  if (!m) return;
  const cls = m.type === 'IN' ? 'b-in' : m.type === 'OUT' ? 'b-out' : 'b-adj';
  sheet('Détail mouvement', `
    <dl class="kv" style="grid-template-columns:auto 1fr;gap:6px 16px;font-size:13px">
      <dt>Date</dt><dd>${fdate(m.date)}</dd>
      <dt>Type</dt><dd><span class="badge ${cls}">${m.type}</span></dd>
      <dt>Article</dt><dd>${esc(m.nom)}</dd>
      <dt>Code</dt><dd>${esc(m.code)}</dd>
      <dt>Quantité</dt><dd>${num(m.quantite)}</dd>
      <dt>Stock avant → après</dt><dd>${num(m.stockAvant)} → ${num(m.stockApres)}</dd>
      <dt>Agence</dt><dd>${esc(m.agence || '')}</dd>
      <dt>Bénéficiaire</dt><dd>${esc(m.beneficiaire || '')}</dd>
      <dt>Opérateur</dt><dd>${esc(m.operateur || '')}</dd>
    </dl>
  `);
}

// ==================== BONS ====================
function bonForm() {
  if (!cart) cart = { demandeur: '', fonction: '', agence: '', bus: '', motif: '', lines: [] };
  const c = cart;
  const lines = c.lines.map((l, i) => {
    const a = db.articles.find((x) => (x._id || x.id) === l.id);
    if (!a) return '';
    return `<tr><td>${esc(a.nom)}</td><td>${esc(a.code)}</td><td><input type="number" value="${l.q}" oninput="app.cartSet(${i},this.value)"></td><td>${num(a.quantite)}</td><td><button class="btn ghost" onclick="app.cartDel(${i})">✕</button></td></tr>`;
  }).join('');
  sheet('🧾 Bon de sortie', `
    <div class="field"><label>Demandeur</label><input value="${esc(c.demandeur)}" oninput="app.cart.demandeur=this.value"></div>
    <div class="field"><label>Agence</label><select onchange="app.cart.agence=this.value">${db.settings.agences.map(ag => `<option ${ag === c.agence ? 'selected' : ''}>${esc(ag)}</option>`).join('')}</select></div>
    <table class="data-table" style="margin-top:12px"><thead><tr><th>Article</th><th>Code</th><th>Qté</th><th>Stock</th><th></th></tr></thead><tbody>${lines}</tbody></table>
    <div class="btngrid" style="margin-top:14px">
      <button class="btn sky" onclick="app.cartAddPicker()">➕ Ajouter article</button>
      <button class="btn red block" onclick="app.cartValidate()">✔ Valider le bon</button>
    </div>
  `);
}

function cartSet(i, v) { cart.lines[i].q = parseFloat(v) || 0; }
function cartDel(i) { cart.lines.splice(i, 1); bonForm(); }
function cartAddPicker() {
  const a = db.articles.filter((x) => x.actif !== false).sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
  sheet('Choisir un article', `<div class="card-list">${a.map((x) => `<div class="item" onclick="app.cartAdd('${x._id || x.id}',1);closeSheet()"><div class="ico">${catIcon(x.categorie)}</div><div class="main"><div class="t">${esc(x.nom)}</div><div class="s">${esc(x.code)} · stock ${num(x.quantite)}</div></div></div>`).join('')}</div>`);
}
function cartAdd(id, q) {
  if (!cart) cart = { demandeur: '', fonction: '', agence: '', bus: '', motif: '', lines: [] };
  const l = cart.lines.find((x) => x.id === id);
  if (l) l.q += q; else cart.lines.push({ id, q });
  bonForm();
}
async function cartValidate() {
  if (!cart || !cart.lines.length) return toast('Ajoutez des articles', 'err');
  try {
    for (const l of cart.lines) {
      const a = db.articles.find((x) => (x._id || x.id) === l.id);
      a.quantite -= l.q;
      await apiPost('mouvements', { articleId: l.id, type: 'OUT', quantite: l.q, stockAvant: a.quantite + l.q, stockApres: a.quantite, agence: cart.agence, beneficiaire: cart.demandeur, motif: cart.motif, operateur: db.settings.operateur, date: new Date().toISOString() });
    }
    cart = null;
    closeSheet();
    renderAll();
    toast('Bon de sortie validé', 'ok');
  } catch (e) { toast('Erreur: ' + e.message, 'err'); }
}

// ==================== PARAMÈTRES ====================
function settingsForm() {
  const S = db.settings;
  sheet('⚙️ Paramètres', `
    <form id="set-form" onsubmit="return false">
      <div class="field"><label>Société</label><input name="societe" value="${esc(S.societe)}"></div>
      <div class="field"><label>Opérateur</label><input name="operateur" value="${esc(S.operateur)}"></div>
      <div class="grid2">
        <div class="field"><label>Préfixe</label><input name="prefixe" value="${esc(S.prefixe)}"></div>
        <div class="field"><label>Devise</label><input name="devise" value="${esc(S.devise)}"></div>
      </div>
      <button class="btn sky block" onclick="app.saveSettingsDesktop()">💾 Enregistrer</button>
    </form>
  `);
}

function saveSettingsDesktop() {
  const f = formData($('#set-form'));
  db.settings.societe = f.societe;
  db.settings.operateur = f.operateur;
  db.settings.prefixe = f.prefixe;
  db.settings.devise = f.devise;
  closeSheet();
  renderAll();
  toast('Paramètres enregistrés', 'ok');
}

// ==================// SYNCHRO ==================
async function syncData() {
  try {
    toast('Synchronisation…', 'sky');
    const data = await apiGet('sync/pull');
    db.articles = data.articles || [];
    db.mouvements = data.mouvements || [];
    db.settings = data.settings || db.settings;
    renderAll();
    toast('Synchronisé ☁️', 'ok');
  } catch (e) { toast('Erreur synchro: ' + e.message, 'err'); }
}

// ==================// EXCEL ==================
function exportExcel() {
  toast('Export Excel à implémenter', 'muted');
}

// ==================// FICHES ==================
function fichesMenu() {
  sheet('🖨️ Fiches de réception', '<p>Fonctionnalité à compléter.</p>');
}

// ==================// TOAST ==================
function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ==================// APP ==================
const app = {
  view: 'home',
  artCat: 'Toutes',
  go: function (v) {
    this.view = v;
    $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
    $$('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    renderAll();
  },
  renderAll, renderHome, renderArticles, renderMouvements,
  articleSheet, articleForm, saveArticle, deleteArticle,
  mvtForm, setMvType, saveMvt, mvSheet,
  bonForm, cartSet, cartDel, cartAdd, cartAddPicker, cartValidate,
  settingsForm, saveSettingsDesktop, syncData, exportExcel, fichesMenu,
};

window.app = app;
window.addEventListener('DOMContentLoaded', renderAll);