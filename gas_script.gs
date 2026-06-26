// ===== 薪資系統 GAS 腳本 =====
// 部署設定：
//   執行身份：「我（你的 Google 帳號）」
//   存取權限：「所有人」（不限登入）
//   類型：網頁應用程式

const FILE_NAME = 'payroll_data_v2.json';
const PHOTO_FOLDER_NAME = 'payroll_photos';

function getDataFile() {
  const files = DriveApp.getFilesByName(FILE_NAME);
  if (files.hasNext()) return files.next();
  return DriveApp.createFile(FILE_NAME, '{}', MimeType.PLAIN_TEXT);
}

function getPhotoFolder() {
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(PHOTO_FOLDER_NAME);
}

// 初次授權用：在 GAS 編輯器裡手動執行此函式
function authorize() {
  getDataFile();
  getPhotoFolder();
}

function doGet(e) {
  try {
    const data = getDataFile().getBlob().getDataAsString();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // ── 上傳照片 ──
    if (payload.action === 'uploadPhoto') {
      const dataUrl = payload.data || '';
      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: 'invalid data URL format' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      const blob = Utilities.newBlob(
        Utilities.base64Decode(base64Data),
        mimeType,
        payload.name || 'photo.jpg'
      );

      const folder = getPhotoFolder();
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      const url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200';

      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, url: url }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── 儲存主資料 ──
    getDataFile().setContent(e.postData.contents);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
