/*
  Dùng file này để bổ sung endpoint JSON cho module Netlify `tra-cuu-lieu-mlct.html`.

  Cách dùng:
  1. Trong Apps Script đang chứa các hàm getUniqueDrugNames() và getDrugDataByHoatChat(),
     thay doGet(e) hiện tại bằng phiên bản dưới đây.
  2. Deploy lại Apps Script dạng Web app, quyền truy cập phù hợp.
  3. Gắn URL Web app vào module Netlify bằng một trong hai cách:
     - thêm ?api=URL_WEB_APP vào link nhúng; hoặc
     - đặt window.DRUGVIEW_MLCT_API_URL = 'URL_WEB_APP' trước script của module.
*/

function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : '';

  if (action) {
    return handleMlctJsonApi_(e);
  }

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CÔNG CỤ TÍNH MỨC LỌC CẦU THẬN VÀ TRA CỨU LIỀU')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handleMlctJsonApi_(e) {
  try {
    const action = e.parameter.action;
    let data;

    if (action === 'getUniqueDrugNames') {
      data = getUniqueDrugNames();
    } else if (action === 'getDrugDataByHoatChat') {
      data = getDrugDataByHoatChat(e.parameter.drugName || '');
    } else {
      throw new Error('Action không hợp lệ: ' + action);
    }

    return makeMlctJsonOutput_({
      ok: true,
      data: data
    });
  } catch (error) {
    return makeMlctJsonOutput_({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function makeMlctJsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
