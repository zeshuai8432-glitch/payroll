const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

// 本機沒資料、雲端各種失敗法，看畫面有沒有把原因講出來
async function boot(br,mode){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  const said=[]; p.on('dialog',d=>{said.push(d.message());d.dismiss();});
  await p.route('**/*',r=>{
    const u=r.request().url();
    if(u.startsWith('file://')) return r.continue();
    if(/firestore/.test(u)){
      if(mode==='offline') return r.abort('failed');
      if(mode==='403') return r.fulfill({status:403,contentType:'application/json',body:'{"error":{"message":"API key not valid"}}'});
      if(mode==='500') return r.fulfill({status:500,contentType:'text/plain',body:'Internal Error'});
      if(mode==='ok') return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({updateTime:'T1',fields:{json:{stringValue:JSON.stringify({savedAt:Date.now(),projects:[{id:'z',name:'雲端來的案',owner:'',vendor:'',taxMode:'excl',blocks:[],periods:[],curPeriod:0,createdAt:1}],cur:'z'})}}})});
    }
    return r.abort();
  });
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1800);
  const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
  return {p,errs,t,said};
}

(async()=>{
  const br=await chromium.launch();

  // ══ ① 連不出去：卡片要寫出原因 ══
  {
    const {p,errs,t}=await boot(br,'offline');
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    ok(/連不到雲端/.test(t),'顯示連不到雲端');
    ok(/原因：/.test(t),'★★ 有寫出原因，不再只說「離線」');
    ok(/連不出去——這台沒網路，或被 VPN／廣告阻擋器／公司網路擋掉了/.test(t),
       '★★ 把 Failed to fetch 翻成看得懂的話');
    ok(!!(await p.$('#btn-clouddiag')),'★★ 有「測試連線（查原因）」按鈕');
    await p.close();
  }

  // ══ ② 雲端回 403：要講是權限問題，不要含糊說離線 ══
  {
    const {p,t}=await boot(br,'403');
    ok(/HTTP 403/.test(t),'② 403 會顯示出來');
    ok(/雲端拒絕這次存取（金鑰或權限設定問題）/.test(t),'★★ 並判讀成金鑰／權限問題');
    await p.close();
  }

  // ══ ③ 500：講成 Google 那邊的問題 ══
  {
    const {p,t}=await boot(br,'500');
    ok(/HTTP 500/.test(t)&&/Google 那邊暫時有問題/.test(t),'③ 500 判讀成伺服器端問題，叫你等一下再試');
    await p.close();
  }

  // ══ ④ 測試連線按鈕：把原原本本的結果講出來 ══
  {
    const {p,said}=await boot(br,'403');
    await p.click('#btn-clouddiag'); await p.waitForTimeout(900);
    const m=said.join('\n');
    ok(/HTTP 狀態：403/.test(m),'④ 測試連線報出 HTTP 狀態');
    ok(/API key not valid/.test(m),'★★ 連雲端回的原始內容都貼出來（才查得到真正原因）');
    ok(/把這段截圖給我/.test(m),'★ 並告訴使用者截圖給我');
    await p.close();
  }

  // ══ ⑤ 連不出去時，測試連線也要報得出錯誤類型 ══
  {
    const {p,said}=await boot(br,'offline');
    await p.click('#btn-clouddiag'); await p.waitForTimeout(900);
    const m=said.join('\n');
    ok(/連不出去/.test(m)&&/錯誤類型：/.test(m)&&/訊息：/.test(m),'⑤ 連不出去時報出錯誤類型與訊息');
    await p.close();
  }

  // ══ ⑥ 連得上就正常載入，不會留下誤導訊息 ══
  {
    const {p,t}=await boot(br,'ok');
    ok(/雲端來的案/.test(t),'⑥ 連得上就把雲端資料載下來');
    ok(!/連不到雲端/.test(t)&&!/原因：/.test(t),'★ 不會殘留失敗訊息');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
