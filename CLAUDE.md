# 專案說明

此 repo 包含三個獨立的單頁 HTML 應用，請勿混淆。

## 檔案對照表

| 檔案 | 系統名稱 | 說明 |
|------|----------|------|
| `payroll.html` | 點工薪資管理系統 | **主要薪資系統**。功能完整，含案場、出工、調整、貸款、工具、資產、帳務等。localStorage key: `pm_data_v2` |
| `payroll-new.html` | 點工薪資管理系統（簡化版） | 給其他使用者用的簡化版本，使用 `r.type` 欄位（`'請假'`/`'休假'`）而非 `r.kind`。**非本專案主力檔案，除非明確指定否則不要修改此檔案** |
| `payroll2.html` | 點工薪資管理系統（同行版） | 從簡化版複製給同行使用的獨立副本：localStorage key 全部 `pm2_` 前綴、雲端用獨立的 GAS 部署（`CLOUD_URL` 與本人資料完全分開）。**除非明確指定否則不要修改；簡化版更新時視需求同步** |
| `pinyou.html` | 品佑帳本 | 案場支出/請款/報價/採購帳本，雲端為 GAS。localStorage key: `pinyou_data_v1` |
| `progress.html` | 工程進度請款系統 | 匯入合約 Excel（純瀏覽器解析 xlsx）抓出細項，每期填完成量/％，自動算本期請款金額並列印估驗請款單（含手寫簽名）。雲端：Firestore `progress/main`（與 payroll 同專案），內容走同一套 E2E 加密（共用 `pm_e2e_key_v1`）。localStorage key: `pm_progress_v1` |
| `index.html` | 倉庫管理系統 | 完全不同的系統，與薪資無關 |

## 重要注意事項

- 修改薪資功能時，目標檔案一律是 **`payroll.html`**，不是 `payroll-new.html`
- 三個檔案各自獨立，不共用程式碼或資料
- 資料存於瀏覽器 localStorage，並可同步至 Google Apps Script
