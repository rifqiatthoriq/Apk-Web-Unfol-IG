/* ==========================================================
   app.js — IG Unfollow Checker (100% client-side)
   Versi 4: reset data, sortir, riwayat unfollow via localStorage
   ========================================================== */

'use strict';

const HISTORY_KEY = 'ig_followers_history';

/* ---------- 1. State & DOM ---------- */
const state = {
  followersKeys: null,   // Set semua pengenal (username/href) dari file followers
  followersNames: [],    // daftar username followers unik (untuk riwayat)
  followersCount: 0,
  followersSample: [],
  followingList: null,   // Array { name, keys[] }
  notFollowingBack: [],
  blocked: false,
};

const $ = (id) => document.getElementById(id);
const els = {
  inputFollowers: $('inputFollowers'), inputFollowing: $('inputFollowing'),
  dropFollowers: $('dropFollowers'), dropFollowing: $('dropFollowing'),
  statusFollowers: $('statusFollowers'), statusFollowing: $('statusFollowing'),
  btnAnalyze: $('btnAnalyze'), btnReset: $('btnReset'),
  historyInfo: $('historyInfo'), historyText: $('historyText'), btnClearHistory: $('btnClearHistory'),
  results: $('results'),
  countFollowers: $('countFollowers'), countFollowing: $('countFollowing'), countNotBack: $('countNotBack'),
  diagBox: $('diagBox'),
  newUnfollowBox: $('newUnfollowBox'), newUnfollowTitle: $('newUnfollowTitle'),
  newUnfollowNote: $('newUnfollowNote'), newUnfollowList: $('newUnfollowList'),
  searchInput: $('searchInput'), sortSelect: $('sortSelect'),
  resultList: $('resultList'), emptyMessage: $('emptyMessage'), allGoodMessage: $('allGoodMessage'),
};

els.inputFollowers.multiple = true; // followers_1.json, followers_2.json, dst.

// Teks status awal dropzone (dipakai saat reset)
const tidy = (t) => t.replace(/\s+/g, ' ').trim();
const DEFAULT_STATUS = {
  followers: tidy(els.statusFollowers.textContent),
  following: tidy(els.statusFollowing.textContent),
};

/* ==========================================================
   2. MEMBACA FILE
   ========================================================== */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File "' + file.name + '" gagal dibaca. Silakan pilih ulang file tersebut.'));
    reader.readAsText(file);
  });
}

async function readJsonFile(file) {
  const text = await readFileAsText(file);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('File "' + file.name + '" bukan JSON yang valid. Kemungkinan file rusak, atau format yang diunduh adalah HTML (harus JSON).');
  }
}

/* ==========================================================
   3. EKSTRAKSI USERNAME
   ========================================================== */
function cleanUsername(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/^@/, '').toLowerCase();
  return name.length > 0 ? name : null;
}

function usernameFromHref(href) {
  if (typeof href !== 'string') return null;
  return cleanUsername(href.split('?')[0].split('/').filter(Boolean).pop());
}

/** Semua pengenal satu item: value -> title -> href. Elemen pertama = nama tampilan. */
function collectKeys(item) {
  if (!item || typeof item !== 'object') return [];
  const keys = [];
  const push = (v) => { if (v && !keys.includes(v)) keys.push(v); };
  const entries = Array.isArray(item.string_list_data) ? item.string_list_data : [];
  entries.forEach((e) => { if (e && typeof e === 'object') push(cleanUsername(e.value)); });
  push(cleanUsername(item.title));
  entries.forEach((e) => { if (e && typeof e === 'object') push(usernameFromHref(e.href)); });
  return keys;
}

function extractFromArray(items) {
  const entries = [];
  let skipped = 0;
  items.forEach((item) => {
    const keys = collectKeys(item);
    if (keys.length > 0) entries.push({ name: keys[0], keys });
    else skipped++;
  });
  return { entries, skipped };
}

function extractFollowers(json, fileName) {
  if (!Array.isArray(json)) {
    const hint = json && Array.isArray(json.relationships_following)
      ? ' File ini tampaknya adalah following.json, bukan followers. Silakan tukar posisinya.' : '';
    throw new Error('Format "' + fileName + '" tidak sesuai sebagai file followers (harus berupa daftar/array).' + hint);
  }
  return extractFromArray(json);
}

function extractFollowing(json, fileName) {
  if (!json || Array.isArray(json) || !Array.isArray(json.relationships_following)) {
    const hint = Array.isArray(json)
      ? ' File ini tampaknya adalah followers, bukan following. Silakan tukar posisinya.' : '';
    throw new Error('Format "' + fileName + '" tidak sesuai sebagai following.json (properti "relationships_following" tidak ditemukan).' + hint);
  }
  return extractFromArray(json.relationships_following);
}

/* ==========================================================
   4. ALGORITMA KOMPARASI
   ========================================================== */

/** Following yang tidak ada di followers (cek semua pengenal), urut A-Z. */
function findNotFollowingBack(followersKeys, followingList) {
  return followingList
    .filter((acc) => !acc.keys.some((k) => followersKeys.has(k)))
    .map((acc) => acc.name)
    .sort((a, b) => a.localeCompare(b));
}

/** Ada di riwayat lama tetapi tidak ada di followers baru = unfollow baru. */
function findNewUnfollowers(previousNames, followersKeys) {
  return previousNames
    .filter((name) => !followersKeys.has(name))
    .sort((a, b) => a.localeCompare(b));
}

/* ==========================================================
   5. RIWAYAT (localStorage, aman terhadap error/mode privat)
   ========================================================== */
function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY));
    if (data && Array.isArray(data.followers)) return data;
  } catch (e) { /* storage tidak tersedia / data rusak */ }
  return null;
}

function saveHistory(names) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), followers: names }));
  } catch (e) { console.warn('Riwayat tidak dapat disimpan:', e); }
}

function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* diabaikan */ }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function updateHistoryInfo() {
  const h = loadHistory();
  els.historyInfo.classList.toggle('hidden', !h);
  if (h) {
    els.historyText.textContent = 'Riwayat analisis terakhir (' + formatDate(h.savedAt) +
      ') tersimpan di peramban ini, hanya di perangkat Anda.';
  }
}

function renderNewUnfollowers(list, savedAt) {
  els.newUnfollowList.innerHTML = '';
  if (list.length === 0) {
    els.newUnfollowBox.classList.add('hidden');
    return;
  }
  els.newUnfollowTitle.textContent =
    '⚠️ Terdeteksi ' + list.length + ' Akun Baru yang Unfollow Anda Sejak Analisis Terakhir!';
  els.newUnfollowNote.textContent =
    'Akun berikut tercatat sebagai pengikut pada analisis tanggal ' + formatDate(savedAt) +
    ', namun tidak ditemukan pada data terbaru. Akun yang menonaktifkan diri atau mengganti username ' +
    'juga dapat muncul di sini. Pastikan data yang diunggah mencakup rentang waktu "All time".';

  list.forEach((username) => {
    const chip = document.createElement('a');
    chip.className = 'inline-flex items-center rounded-full border border-rose-400/40 bg-zinc-900 px-3 py-1 text-xs text-zinc-200 hover:border-fuchsia-500';
    chip.href = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
    chip.target = '_blank';
    chip.rel = 'noopener noreferrer';
    chip.textContent = username;
    els.newUnfollowList.appendChild(chip);
  });
  els.newUnfollowBox.classList.remove('hidden');
}

/* ==========================================================
   6. UPLOAD
   ========================================================== */
function setZoneState(zoneEl, statusEl, type, message) {
  zoneEl.classList.toggle('is-loaded', type === 'ok');
  zoneEl.classList.toggle('is-error', type === 'error');
  statusEl.textContent = message;
}

function refreshAnalyzeButton() {
  els.btnAnalyze.disabled = !(state.followersKeys && state.followingList);
}

async function handleFollowersFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  try {
    const keys = new Set();
    const names = new Set();
    let skipped = 0;
    for (const file of files) {
      const result = extractFollowers(await readJsonFile(file), file.name);
      result.entries.forEach((en) => { en.keys.forEach((k) => keys.add(k)); names.add(en.name); });
      skipped += result.skipped;
    }
    if (names.size === 0) {
      throw new Error('Tidak ada username yang ditemukan di file followers. Silakan periksa kembali file yang Anda pilih.');
    }
    state.followersKeys = keys;
    state.followersNames = [...names];
    state.followersCount = names.size;
    state.followersSample = state.followersNames.slice(0, 3);
    let msg = (files.length > 1 ? files.length + ' file' : files[0].name) + ' · ' + names.size + ' akun';
    if (skipped > 0) msg += ' (' + skipped + ' entri dilewati)';
    setZoneState(els.dropFollowers, els.statusFollowers, 'ok', msg);
  } catch (err) {
    state.followersKeys = null;
    setZoneState(els.dropFollowers, els.statusFollowers, 'error', 'File gagal dimuat, silakan coba lagi');
    alert(err.message);
  }
  refreshAnalyzeButton();
}

async function handleFollowingFiles(fileList) {
  const file = fileList && fileList[0];
  if (!file) return;
  try {
    const result = extractFollowing(await readJsonFile(file), file.name);
    const seen = new Set();
    const list = result.entries.filter((en) => (seen.has(en.name) ? false : seen.add(en.name)));
    if (list.length === 0) {
      throw new Error('Tidak ada username yang ditemukan di "' + file.name + '". Silakan periksa kembali file yang Anda pilih.');
    }
    state.followingList = list;
    let msg = file.name + ' · ' + list.length + ' akun';
    if (result.skipped > 0) msg += ' (' + result.skipped + ' entri dilewati)';
    setZoneState(els.dropFollowing, els.statusFollowing, 'ok', msg);
  } catch (err) {
    state.followingList = null;
    setZoneState(els.dropFollowing, els.statusFollowing, 'error', 'File gagal dimuat, silakan coba lagi');
    alert(err.message);
  }
  refreshAnalyzeButton();
}

function setupDropzone(inputEl, zoneEl, handler) {
  inputEl.addEventListener('change', (e) => handler(e.target.files));
  ['dragenter', 'dragover'].forEach((evt) =>
    zoneEl.addEventListener(evt, (e) => { e.preventDefault(); zoneEl.classList.add('is-dragover'); }));
  ['dragleave', 'drop'].forEach((evt) =>
    zoneEl.addEventListener(evt, (e) => { e.preventDefault(); zoneEl.classList.remove('is-dragover'); }));
  zoneEl.addEventListener('drop', (e) => handler(e.dataTransfer.files));
}

setupDropzone(els.inputFollowers, els.dropFollowers, handleFollowersFiles);
setupDropzone(els.inputFollowing, els.dropFollowing, handleFollowingFiles);

/* ==========================================================
   7. PANEL DIAGNOSA
   ========================================================== */
function showDiagnostics(matched, blocked) {
  const total = state.followingList.length;
  const followingSample = state.followingList.slice(0, 3).map((a) => a.name).join(', ');

  els.diagBox.className = 'mb-4 rounded-xl border p-3 text-xs ' +
    (blocked ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
             : 'border-zinc-700 bg-zinc-800/60 text-zinc-400');
  els.diagBox.textContent = '';

  const lines = [];
  if (blocked) {
    lines.push('Hasil ditahan: tidak ada satu pun akun pada daftar yang Anda ikuti yang cocok dengan daftar pengikut. ' +
      'Hal ini hampir pasti berarti data belum terbaca dengan benar, atau kedua file bukan pasangan yang sesuai ' +
      '(berbeda akun atau berbeda waktu unduh). Agar tidak menampilkan hasil yang keliru, daftar sengaja tidak ditampilkan.');
  } else {
    lines.push('Cocok di kedua daftar: ' + matched + ' dari ' + total + ' akun yang Anda ikuti.');
  }
  lines.push('Contoh pengikut terdeteksi: ' + (state.followersSample.join(', ') || '-'));
  lines.push('Contoh akun yang diikuti terdeteksi: ' + (followingSample || '-'));

  lines.forEach((text) => {
    const p = document.createElement('p');
    p.textContent = text;
    els.diagBox.appendChild(p);
  });
}

/* ==========================================================
   8. DAFTAR HASIL (pencarian + sortir real-time)
   ========================================================== */
function renderList() {
  const keyword = els.searchInput.value.trim().toLowerCase();
  const descending = els.sortSelect.value === 'za';

  const shown = state.notFollowingBack
    .filter((u) => u.includes(keyword))
    .sort((a, b) => (descending ? b.localeCompare(a) : a.localeCompare(b)));

  els.resultList.innerHTML = '';
  shown.forEach((username) => {
    const card = document.createElement('a');
    card.className = 'user-card';
    card.href = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = username;

    const go = document.createElement('span');
    go.className = 'go';
    go.textContent = 'Buka profil';

    card.append(name, go);
    els.resultList.appendChild(card);
  });

  const noResultsAtAll = state.notFollowingBack.length === 0;
  els.allGoodMessage.classList.toggle('hidden', !noResultsAtAll || state.blocked);
  els.emptyMessage.classList.toggle('hidden', noResultsAtAll || shown.length > 0);
}

/* ==========================================================
   9. AKSI TOMBOL
   ========================================================== */
els.btnAnalyze.addEventListener('click', () => {
  const total = state.followingList.length;
  const notBack = findNotFollowingBack(state.followersKeys, state.followingList);
  const matched = total - notBack.length;

  state.blocked = matched === 0;
  state.notFollowingBack = state.blocked ? [] : notBack;

  els.countFollowers.textContent = state.followersCount;
  els.countFollowing.textContent = total;
  els.countNotBack.textContent = state.blocked ? '-' : state.notFollowingBack.length;

  // Fitur 4: bandingkan dengan riwayat SEBELUM menyimpan data baru.
  // Data yang ditahan (tidak valid) tidak dibandingkan dan tidak disimpan.
  if (state.blocked) {
    renderNewUnfollowers([], null);
  } else {
    const previous = loadHistory();
    renderNewUnfollowers(previous ? findNewUnfollowers(previous.followers, state.followersKeys) : [],
                         previous ? previous.savedAt : null);
    saveHistory(state.followersNames);
    updateHistoryInfo();
  }

  els.searchInput.value = '';
  els.sortSelect.value = 'az';
  els.results.classList.remove('hidden');
  showDiagnostics(matched, state.blocked);
  renderList();
  els.results.scrollIntoView({ behavior: 'smooth' });
});

/** Fitur 2: kosongkan input, status, state, dan sembunyikan hasil. Riwayat tidak ikut terhapus. */
function resetAll() {
  els.inputFollowers.value = '';
  els.inputFollowing.value = '';

  [[els.dropFollowers, els.statusFollowers, DEFAULT_STATUS.followers],
   [els.dropFollowing, els.statusFollowing, DEFAULT_STATUS.following]].forEach(([zone, status, text]) => {
    zone.classList.remove('is-loaded', 'is-error', 'is-dragover');
    status.textContent = text;
  });

  state.followersKeys = null;
  state.followersNames = [];
  state.followersCount = 0;
  state.followersSample = [];
  state.followingList = null;
  state.notFollowingBack = [];
  state.blocked = false;

  els.btnAnalyze.disabled = true;
  els.searchInput.value = '';
  els.sortSelect.value = 'az';
  els.resultList.innerHTML = '';
  els.diagBox.textContent = '';
  renderNewUnfollowers([], null);
  els.results.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

els.btnReset.addEventListener('click', resetAll);

els.btnClearHistory.addEventListener('click', () => {
  if (confirm('Hapus riwayat analisis yang tersimpan di peramban ini?')) {
    clearHistory();
    updateHistoryInfo();
    renderNewUnfollowers([], null);
  }
});

els.searchInput.addEventListener('input', renderList);
els.sortSelect.addEventListener('change', renderList);

updateHistoryInfo();
