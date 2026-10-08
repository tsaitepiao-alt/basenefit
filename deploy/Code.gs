/**
 * basenefit 雲端同步後端（Google Apps Script）
 * ------------------------------------------------------------
 * 用途：讓多名學員／教練在不同手機上共用同一份資料。
 * 資料存在你自己的 Google 試算表裡（不會經過第三方）。
 *
 * 儲存格式（工作分頁 basefit-state）：
 *   A 欄 = 同步代號（key，例如學員姓名或代號）
 *   B 欄 = 片號
 *   C 欄 = 資料（JSON 片段）
 *   D 欄 = 更新時間
 *
 * 為什麼要「分片」：Google 試算表單一格上限 5 萬字元，
 * 20 位學員的資料約一個月就會超過，所以整包 JSON 切成
 * 4 萬字元一片、一片一列存放；每片前面加一個空白，
 * 避免內容被試算表當成公式。
 *
 * 為什麼要「分代號」：每位學員用自己的代號存自己的一份，
 * 才不會互相覆蓋；教練可用 action=all 一次彙整所有人的小考弱點。
 *
 * 部署步驟見同資料夾的 README-雲端同步.md
 * 部署時務必選：執行身分＝我、可以存取的使用者＝任何人
 */

const SHEET_NAME = 'basefit-state';
const CHUNK = 40000;
const MAX_KEYS = 60;      // 彙整時最多處理幾位學員（保護用）

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'save') {
      const key = safeKey(body.key);
      const n = setState(key, body.state);
      return out({ ok: true, key: key, chunks: n });
    }
    return out({ ok: false, error: 'unknown action: ' + body.action });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'load';
  let payload;
  if (action === 'load') {
    const key = safeKey(p.key);
    payload = { ok: true, key: key, state: getState(key) };
  } else if (action === 'keys') {
    payload = { ok: true, keys: listKeys() };
  } else if (action === 'all') {
    payload = { ok: true, keys: listKeys(), all: getAllSummary() };
  } else {
    payload = { ok: false, error: 'unknown action' };
  }
  // 支援 JSONP：前端用 <script> 讀取，才能繞過瀏覽器的跨網域限制
  if (p.callback) {
    return ContentService
      .createTextOutput(p.callback + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return out(payload);
}

/* ---------- 試算表存取 ---------- */

function safeKey(k) {
  const s = String(k == null ? '' : k).trim().replace(/[\r\n\t]/g, ' ').slice(0, 60);
  return s || 'default';
}

function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, 4).setValues([['同步代號', '片號', '資料', '更新時間']]);
    sh.setColumnWidth(1, 120);
    sh.setColumnWidth(2, 60);
    sh.setColumnWidth(3, 600);
  }
  return sh;
}

function setState(key, state) {
  const sh = sheet();
  const last = sh.getLastRow();
  if (last >= 2) {                                   // 先清掉這個代號的舊資料
    const col = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = col.length - 1; i >= 0; i--) {
      if (String(col[i][0]).trim() === key) sh.deleteRow(i + 2);
    }
  }
  const chunks = chunkState(JSON.stringify(state));
  const start = sh.getLastRow() + 1;
  const rows = chunks.map(function (c, i) { return [key, i + 1, c, new Date()]; });
  sh.getRange(start, 1, rows.length, 4).setValues(rows);
  return rows.length;
}

function getState(key) {
  const sh = sheet();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, 3).getValues();
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() !== key) continue;
    const cell = rows[i][2];
    if (cell === '' || cell === null) continue;
    pairs.push([Number(rows[i][1]) || (i + 1), String(cell)]);
  }
  pairs.sort(function (a, b) { return a[0] - b[0]; });   // 依片號還原順序
  const json = joinChunks(pairs.map(function (p) { return p[1]; }));
  return json ? JSON.parse(json) : null;
}

function listKeys() {
  const sh = sheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, 1).getValues();
  const seen = {};
  for (let i = 0; i < rows.length; i++) {
    const k = String(rows[i][0] || '').trim();
    if (k) seen[k] = 1;
  }
  return Object.keys(seen).sort();
}

/* 只回傳彙整需要的欄位（小考弱點），避免整包資料太大 */
function getAllSummary() {
  const map = {};
  const keys = listKeys();
  for (let i = 0; i < keys.length && i < MAX_KEYS; i++) {
    const st = getState(keys[i]);
    if (!st) continue;
    map[keys[i]] = {
      me: { name: (st.me && st.me.name) || keys[i] },
      quiz: slimQuiz(st.quiz),
      sessions: (st.sessions || []).length
    };
  }
  return map;
}

/* 小考統計瘦身：最多 200 題、解說只留前 40 字，避免回應過大 */
function slimQuiz(q) {
  const st = (q && q.stats) || {};
  const ks = Object.keys(st).slice(0, 200);
  const out = {};
  for (let i = 0; i < ks.length; i++) {
    const v = st[ks[i]] || {};
    out[ks[i]] = {
      seen: Number(v.seen) || 0,
      wrong: Number(v.wrong) || 0,
      text: String(v.text || '').slice(0, 80),
      ans: String(v.ans || '').slice(0, 60),
      why: String(v.why || '').slice(0, 40)
    };
  }
  return { stats: out, history: ((q && q.history) || []).slice(-20) };
}

/* ---------- 純函式（可獨立測試）---------- */

function chunkState(str) {
  const out = [];
  for (let i = 0; i < str.length; i += CHUNK) out.push(' ' + str.substr(i, CHUNK));
  return out;
}

function joinChunks(chunks) {
  return chunks.map(function (c) { return String(c).slice(1); }).join('');
}

/* ---------- 輸出 ---------- */

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
