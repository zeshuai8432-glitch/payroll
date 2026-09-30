# 測試

Playwright 無頭瀏覽器直接開 `progress.html` 跑真實操作，不需要起服務。

## 跑法

```bash
cd tests
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node prog-smoke2.test.js
```

檔案裡的路徑是 `file:///home/user/payroll/<檔名>.html`，換機器要改。
`prog-*` 測 `progress.html`，`wage-*` 測 `payroll.html`。

## 有哪些

| 檔案 | 測什麼 |
|------|--------|
| `prog-smoke2.test.js` | 四個分頁渲染、填進度、工序子列轉出、發包分配、期別鎖定，全程無 JS 錯誤 |
| `prog-donelast.test.js` | 「已完成幾間」讀最新一期（舊期填錯、新期改正後要轉得出去） |
| `prog-blkspan.test.js` | 區塊標題顯示這份實際做幾間（而非照抄母專案的間數）、空區塊的隱藏 |
| `prog-printas.test.js` | 多條細項在請款單上併成一行（資料仍逐條，發包分配不受影響） |
| `prog-mergeprint.test.js` | 同一廠商在別的案場／零星工程的金額，可併入同一張請款單列印（帳不混） |
| `wage-measqty.test.js` | payroll 計量明細：隔間㎡ 的數量可切手動輸入（`payroll.html`） |

## 為什麼放這裡

這些測試原本只存在暫存目錄，容器回收就整批消失了。放進 repo 才留得住。
