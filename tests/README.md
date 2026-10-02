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
| `prog-xferin.test.js` | ↙ 從別家轉入（搬量守恆、擋對方已做掉的量）＋ 同一條母細項拆出的工序不得被併成一條 |
| `prog-blkspan.test.js` | 區塊標題顯示這份實際做幾間（而非照抄母專案的間數）、空區塊的隱藏 |
| `prog-cnttag.test.js` | 合約明細每條都看得到「這家拿到幾間」（含照區塊那種）、工序各道分別顯示、各道不同時標出範圍、母專案不灌雜訊 |
| `prog-groupedit.test.js` | 拆成工序的那條，收合那行可直接改名稱／數量／單價（值的邏輯） |
| `prog-clouddiag.test.js` | 雲端連不上時把真正原因講出來，並提供連線測試 |
| `prog-lockedui.test.js` | 新裝置上沒本機資料時，要分清「加密沒解鎖」「連不上」「真的沒資料」 |
| `prog-unlockfix.test.js` | 手機讀不到雲端：瀏覽器缺 DecompressionStream、prompt 被擋、開頁不自動問密碼、解不開時禁止上傳 |
| `prog-plans.test.js` | 圖面附件：存本機不同步、按房型穿插列印、空間滿的處理 |
| `prog-backupplans.test.js` | 匯出備份要含圖面、匯入要還原回 IndexedDB、刪專案要清掉它的圖面且不動別的專案 |
| `prog-printnote.test.js` | 請款單印出備註（放名稱底下、濾掉系統自動寫的轉出紀錄） |
| `prog-noteedit.test.js` | 備註點一下就能改（群組一起改／工序個別改／不一樣時先問） |
| `prog-groupedit2.test.js` | 同上的操作方式：平常是文字，點一下才變輸入框 |
| `prog-blkcap.test.js` | 房型層級的發包金額上限（子合約可任意重寫、超過才報錯） |
| `prog-allocnotice.test.js` | 每個分頁都看得到的提示列：合併過的子合約不誤報超額、真超額要報、對不到母合約的子區塊要點出來、填了議價折讓要講明數字沒套 |
| `prog-xcopyfind.test.js` | 抓細項說「已經有了」卻找不到：帶我去看、強制抓、回收桶優先、拆成工序的比對 |
| `prog-copypick.test.js` | 複製細項可勾選：來源含「這一份的其他房型」、項次／章節／印作照帶、不被當成追加、單價可覆寫、金額算進母合約與折讓分母 |
| `prog-printas.test.js` | 多條細項在請款單上併成一行（資料仍逐條，發包分配不受影響） |
| `prog-printas2.test.js` | 印作要跟著發包走、單條當純改名用、批次設定（代工母專案一條對一條不動結構） |
| `prog-mergeprint.test.js` | 同一廠商在別的案場／零星工程的金額，可併入同一張請款單列印（帳不混） |
| `wage-measqty.test.js` | payroll 計量明細：隔間㎡ 的數量可切手動輸入（`payroll.html`） |

## 為什麼放這裡

這些測試原本只存在暫存目錄，容器回收就整批消失了。放進 repo 才留得住。
