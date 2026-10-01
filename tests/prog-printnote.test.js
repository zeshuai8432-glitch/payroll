const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

const seed={ projects:[
 { id:'p1', name:'鑫喆商旅', owner:'鑫喆', vendor:'東澤', taxMode:'excl',
   blocks:[{id:'b1',name:'TYPE-SK',unit:'間',count:22,items:[
     {id:'i1',no:'6.1',tag:'',chapter:'內隔間',name:'床頭複牆',unit:'㎡',qty:43.72,price:30,amount:1311.6,remark:'TYPE-A管線層/不含隔音測試'},
     // 備註裡混了系統自動寫的轉出紀錄
     {id:'i2',no:'6.14',tag:'',chapter:'內隔間',name:'壁龕開孔補強',unit:'口',qty:1,price:500,amount:500,remark:'詳圖7 & 8/IM-5503；2026-09-28 原 10 間，轉 3 間 給 進凱'},
     // 整條都是系統紀錄
     {id:'i3',no:'6.15',tag:'',chapter:'內隔間',name:'門樘補強',unit:'樘',qty:2,price:300,amount:600,remark:'2026-09-30 自 鑫 接手 5 間'},
     {id:'i4',no:'6.16',tag:'',chapter:'內隔間',name:'無備註的一條',unit:'㎡',qty:1,price:100,amount:100,remark:''},
     // 合併列印的兩條
     {id:'i5',no:'6.20',tag:'',chapter:'內隔間',name:'天花',unit:'㎡',qty:10,price:100,amount:1000,remark:'TYPE-K',printAs:'牆面工程'},
     {id:'i6',no:'6.21',tag:'',chapter:'內隔間',name:'油漆',unit:'㎡',qty:5,price:100,amount:500,remark:'TYPE-K；2026-09-28 原 8 間，轉 2 間 給 阿華',printAs:'牆面工程'}]}],
   periods:[{no:1,date:'2026-10-01',prog:{i1:{p:1,q:43.72*22},i2:{p:1,q:22},i3:{p:1,q:44},i4:{p:1,q:22},i5:{p:1,q:220},i6:{p:1,q:110}}}],
   curPeriod:0, createdAt:1 }
], cur:'p1', tab:'prog'};

(async()=>{
  const br=await chromium.launch(); const p=await br.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',d=>d.dismiss());
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},seed);
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1200);
  await p.evaluate(()=>{window.print=function(){};});
  await p.click('#btn-print'); await p.waitForTimeout(1000);
  const d=await p.evaluate(()=>{const el=document.querySelector('#print-overlay .pcontent');return el?el.innerText.replace(/\s+/g,' '):'';});
  ok(errs.length===0,'JS 無錯誤'+(errs.length?'：'+errs[0]:''));

  // ── 自己寫的備註會印出來 ──
  ok(/TYPE-A管線層\/不含隔音測試/.test(d),'★★ 自己寫的備註印出來了');
  ok(/詳圖7 & 8\/IM-5503/.test(d),'★★ 混在一起時，自己寫的那段保留');

  // ── 系統自動寫的濾掉 ──
  ok(!/轉 3 間 給 進凱/.test(d),'★★ 轉出紀錄不會印到給工班的單子上');
  ok(!/自 鑫 接手/.test(d),'★★ 接手紀錄也濾掉');
  ok(!/2026-09-28/.test(d)&&!/2026-09-30/.test(d),'★ 系統紀錄的日期也跟著不見');
  ok(/門樘補強/.test(d),'★ 但那條細項本身照常印（只是沒有備註）');

  // ── 合併列印那行：去重後接起來 ──
  ok(/牆面工程/.test(d),'合併那行在');
  ok(/含 天花、油漆/.test(d),'★ 底下列出含哪幾條');
  const once=(d.match(/TYPE-K/g)||[]).length;
  ok(once===1,'★★ 兩條備註都是 TYPE-K，合併後只印一次（實際 '+once+' 次）');

  // ── 版面：備註在名稱底下，不是另開一欄 ──
  const cols=await p.evaluate(()=>{
    const div=[...document.querySelectorAll('#print-overlay .pcontent div')].find(x=>!x.children.length&&/完成進度明細/.test(x.textContent||''));
    let el=div; while(el&&el.tagName!=='TABLE') el=el.nextElementSibling;
    return el?[...el.querySelectorAll('th')].map(x=>x.textContent.trim()):null;});
  ok(cols&&!cols.includes('備註'),'★★ 沒有另開「備註」欄（欄位：'+JSON.stringify(cols)+'）');
  const under=await p.evaluate(()=>{
    const tds=[...document.querySelectorAll('#print-overlay td')];
    const td=tds.find(x=>/床頭複牆/.test(x.textContent||''));
    const sub=td&&td.querySelector('div');
    return sub?sub.textContent.trim():null;});
  ok(under==='TYPE-A管線層/不含隔音測試','★★ 備註就在名稱那一格底下（'+under+'）');

  // ── 沒備註的不會多出空白行 ──
  const empty=await p.evaluate(()=>{
    const tds=[...document.querySelectorAll('#print-overlay td')];
    const td=tds.find(x=>/無備註的一條/.test(x.textContent||''));
    return td?td.querySelectorAll('div').length:-1;});
  ok(empty===0,'★ 沒備註的那條不會多出空的小字行');

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
