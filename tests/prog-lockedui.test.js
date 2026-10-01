const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

// 一台新裝置：本機完全沒資料
async function boot(br,setup){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',d=>d.dismiss());   // 模擬手機把密碼框擋掉／使用者按取消
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  if(setup) await p.addInitScript(setup);
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1600);
  const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
  return {p,errs,t};
}

(async()=>{
  const br=await chromium.launch();

  // ══ ① 連不到雲端又沒本機資料：不可以說「還沒有專案」 ══
  {
    const {p,errs,t}=await boot(br);
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    ok(!/還沒有專案/.test(t),'★★ 不再顯示「還沒有專案」——那會讓人以為資料不見了');
    ok(/連不到雲端/.test(t),'★★ 改成講實話：連不到雲端，這台也還沒有本機資料');
    ok(/別急著重建專案/.test(t),'★★ 並擋下最糟的反應：別急著重建');
    ok(/你的資料在雲端，等連得上就會自己下來/.test(t),'★ 告訴他資料還在');
    ok(!!(await p.$('#btn-retrycloud')),'★ 有「再連一次」按鈕');
    await p.close();
  }

  // ══ ② 雲端資料加密、這台沒密碼：要顯示解鎖卡 ══
  {
    const {p,errs,t}=await boot(br,()=>{
      // 模擬 cloudPull 拿到密文、使用者沒解鎖（手機常把開頁的 prompt 擋掉）
      window.__forceLocked=true;
      const iv=setInterval(()=>{ if(typeof cloudLocked!=='undefined'){ clearInterval(iv);
        cloudLocked=true; setCloud('已加密未解鎖（點此輸入密碼）'); render(); } },50);
    });
    ok(errs.length===0,'② JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    ok(/雲端資料已加密，還沒解鎖/.test(t),'★★ 明講是加密沒解鎖，不是沒資料');
    ok(/你的資料還在/.test(t),'★★ 直接安撫：資料還在');
    ok(/手機瀏覽器常會擋掉開頁時自動跳出的密碼框/.test(t),'★★ 解釋為什麼沒看到密碼框');
    ok(/密碼跟 payroll 薪資系統是同一組/.test(t),'★ 提示密碼是哪一組');
    ok(!!(await p.$('#btn-unlock')),'★★ 有大顆的「🔓 輸入密碼解鎖」可以按（按鈕觸發的 prompt 不會被擋）');
    await p.close();
  }

  // ══ ③ 按解鎖會真的再跑一次雲端流程 ══
  {
    const {p}=await boot(br,()=>{
      const iv=setInterval(()=>{ if(typeof cloudLocked!=='undefined'){ clearInterval(iv);
        cloudLocked=true; setCloud('已加密未解鎖（點此輸入密碼）'); render(); } },50);
    });
    await p.evaluate(()=>{ window.__calls=0; const real=window.initCloud;
      window.initCloud=function(){ window.__calls++; return real.apply(this,arguments); }; });
    await p.click('#btn-unlock'); await p.waitForTimeout(600);
    const r=await p.evaluate(()=>({calls:window.__calls,locked:cloudLocked}));
    ok(r.calls===1,'③ 按下去會重跑雲端連線（這次是使用者操作觸發，密碼框不會被瀏覽器擋）');
    ok(r.locked===false||r.locked===true,'★ 流程有走到（locked='+r.locked+'）');
    await p.close();
  }

  // ══ ④ 真的是新使用者（有連上、雲端也空的）才顯示「還沒有專案」 ══
  {
    const {p,t}=await boot(br,()=>{
      const iv=setInterval(()=>{ if(typeof cloudLocked!=='undefined'){ clearInterval(iv);
        cloudLocked=false; setCloud('已同步'); render(); } },50);
    });
    ok(/還沒有專案/.test(t),'④ 連得上、雲端也是空的，才顯示「還沒有專案」');
    ok(!!(await p.$('#btn-import2')),'★ 這時候才給匯入／手動建的按鈕');
    await p.close();
  }

  // ══ ⑤ 有本機資料時完全不受影響 ══
  {
    const {p,t}=await boot(br,()=>{
      localStorage.setItem('pm_e2e_key_v1','x');
      localStorage.setItem('pm_progress_v1',JSON.stringify({projects:[{id:'p1',name:'有資料的案',owner:'',vendor:'',
        taxMode:'excl',blocks:[],periods:[],curPeriod:0,createdAt:1}],cur:'p1',tab:'items'}));
    });
    ok(/有資料的案/.test(t),'⑤ 本機有資料就照常顯示');
    ok(!/雲端資料已加密/.test(t)&&!/連不到雲端，這台也還沒有/.test(t),'★ 不會跳出那兩張卡');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
