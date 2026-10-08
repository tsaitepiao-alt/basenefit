/**
 * basenefit 雲端同步後端（Google Apps Script）
 * ------------------------------------------------------------
 * 用途：讓多名學員／教練在不同手機上共用同一份資料。
 * 資料實際存在你自己的 Google 試算表裡（不會經過第三方）。
 *
 * 部署步驟見同資料夾的 README-雲端同步.md
 * 部署時務必選：執行身分＝我、可以存取的使用者＝任何人
 */

const SHEET_NAME = 'basefit-state';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'save') {
      setState(body.state);
      return out({ ok: true });
    }
    return out({ ok: false, error: 'unknown action: ' + body.action });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'load';
  const payload = action === 'load' ? { ok: true, state: getState() } : { ok: false, error: 'unknown action' };
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
    sh.appendRow(['updated', 'json']);
    sh.setColumnWidth(1, 180);
    sh.setColumnWidth(2, 600);
  }
  return sh;
}

function setState(state) {
  const sh = sheet();
  sh.getRange(2, 1, 1, 2).setValues([[new Date(), JSON.stringify(state)]]);
}

function getState() {
  const sh = sheet();
  const v = sh.getRange(2, 2).getValue();
  return v ? JSON.parse(v) : null;
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
