# 專案說明

此 repo 包含三個獨立的單頁 HTML 應用，請勿混淆。

## 檔案對照表

| 檔案 | 系統名稱 | 說明 |
|------|----------|------|
| `payroll.html` | 點工薪資管理系統 | **主要薪資系統**。功能完整，含案場、出工、調整、貸款、工具、資產、帳務等。localStorage key: `pm_data_v2` |
| `payroll-new.html` | （舊的實驗版） | 較簡化的薪資版本，使用 `r.type` 欄位（`'請假'`/`'休假'`）而非 `r.kind`。非主力檔案，勿與 payroll.html 混淆 |
| `index.html` | 材料管理系統 | 完全不同的系統，與薪資無關 |

## 重要注意事項

- 修改薪資功能時，目標檔案一律是 **`payroll.html`**，不是 `payroll-new.html`
- 三個檔案各自獨立，不共用程式碼或資料
- 資料存於瀏覽器 localStorage，並可同步至 Google Apps Script
