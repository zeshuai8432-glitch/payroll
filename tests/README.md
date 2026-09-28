# 測試

Playwright 無頭瀏覽器直接開 `progress.html` 跑真實操作，不需要起服務。

## 跑法

```bash
cd tests
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node prog-smoke2.test.js
```

檔案裡的路徑是 `file:///home/user/payroll/progress.html`，換機器要改。

## 有哪些

| 檔案 | 測什麼 |
|------|--------|
| `prog-smoke2.test.js` | 四個分頁渲染、填進度、工序子列轉出、發包分配、期別鎖定，全程無 JS 錯誤 |
| `prog-donelast.test.js` | 「已完成幾間」讀最新一期（舊期填錯、新期改正後要轉得出去） |

## 為什麼放這裡

這些測試原本只存在暫存目錄，容器回收就整批消失了。放進 repo 才留得住。
