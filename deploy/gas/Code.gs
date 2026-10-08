/**
 * basenefit 雲端同步後端（Google Apps Script）
 * ------------------------------------------------------------
 * 用途：讓多名學員／教練在不同手機上共用同一份資料。
 * 資料存在你自己的 Google 試算表裡（不會經過第三方）。
 *
 * 為什麼要「分片」：Google 試算表單一格上限 5 萬字元，
 * 20 位學員的資料約一個月就會超過，所以整包 JSON 切成
 * 4 萬字元一片、一片一列存放；每片前面加一個空白，
 * 避免內容被試算表當成公式。
 *
 * 部署步驟見同資料夾的 README-雲端同步.md
 * 部署時務必選：執行身分＝我、可以存取的使用者＝任何人
 */

const SHEET_NAME = 'basefit-state';
const CHUNK = 40000;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'save') {
      const n = setState(body.state);
      return out({ ok: true, chunks: n });
    }
    return out({ ok: false, error: 'unknown action: ' + body.action });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'load';
  const payload = action === 'load'
    ? { ok: true, state: getState() }
    : { ok: false, error: 'unknown action' };
  // 支援 JSONP：前端用 <script> 讀取，才能繞過瀏覽器的跨網域限制
  if (p.callback) {
    return ContentService
      .createTextOutput(p.callback + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return out(payload);
}

function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, 3).setValues([['片號', '資料', '更新時間']]);
    sh.setColumnWidth(1, 60);
    sh.setColumnWidth(2, 600);
  }
  return sh;
}

function setState(state) {
  const sh = sheet();
  const chunks = chunkState(JSON.stringify(state));
  const rows = chunks.map(function (c, i) { return [i + 1, c]; });
  sh.clearContents();
  sh.getRange(1, 1, 1, 3).setValues([['片號', '資料', '更新時間']]);
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.getRange(2, 3).setValue(new Date());
  return rows.length;
}

function getState() {
  const sh = sheet();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, 2).getValues();
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i][1];
    if (cell === '' || cell === null) continue;
    pairs.push([Number(rows[i][0]) || (i + 1), String(cell)]);
  }
  pairs.sort(function (a, b) { return a[0] - b[0]; });      // 依片號還原順序
  const json = joinChunks(pairs.map(function (p) { return p[1]; }));
  return json ? JSON.parse(json) : null;
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
