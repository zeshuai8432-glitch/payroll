const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

// 鑫喆商旅 底下發包給「進凱」；進凱同時還做了「文心大樓」（另一個正式案場）
// 以及一個「零星工程」的獨立專案
const seed={ projects:[
 { id:'m1', name:'鑫喆商旅', owner:'鑫喆', vendor:'東澤', taxMode:'excl',
   blocks:[{id:'mb1',name:'TYPE-SK',unit:'間',count:12,items:[
     {id:'ma',no:'6.1',name:'骨架',unit:'㎡',qty:40,price:1000,amount:40000,remark:''}]}],
   periods:[], curPeriod:0, createdAt:1 },
 { id:'kJ', parentId:'m1', name:'鑫喆商旅-進凱', vendor:'進凱', taxMode:'excl',
   blocks:[{id:'jb1',name:'TYPE-SK',unit:'間',count:12,srcBlk:'mb1',items:[
     {id:'ja',no:'6.1',name:'骨架',unit:'㎡',qty:40,price:700,amount:28000,remark:'',srcId:'ma'}]}],
   periods:[{no:1,date:'2026-09-01',prog:{ja:{p:0.25,q:120}}}], curPeriod:0, createdAt:2 },
 // 另一個正式案場，也發包給進凱
 { id:'m2', name:'文心大樓', owner:'文心', vendor:'東澤', taxMode:'excl',
   blocks:[{id:'nb1',name:'B1',unit:'間',count:4,items:[
     {id:'na',no:'1.1',name:'隔間',unit:'㎡',qty:20,price:900,amount:18000,remark:''}]}],
   periods:[], curPeriod:0, createdAt:3 },
 { id:'kJ2', parentId:'m2', name:'文心大樓-進凱', vendor:'進凱', taxMode:'incl',
   blocks:[{id:'j2b',name:'B1',unit:'間',count:4,srcBlk:'nb1',items:[
     {id:'j2a',no:'1.1',name:'隔間',unit:'㎡',qty:20,price:600,amount:12000,remark:'',srcId:'na'}]}],
   periods:[{no:1,date:'2026-09-05',prog:{j2a:{p:0.5,q:40}}}], curPeriod:0, createdAt:4 },
 // 零星工程：沒有母專案的獨立專案
 { id:'z1', name:'零星工程', owner:'', vendor:'進凱', taxMode:'excl', withholdPct:10,
   blocks:[{id:'zb1',name:'修繕',unit:'式',count:1,items:[
     {id:'za',no:'1',name:'補牆',unit:'式',qty:1,price:8000,amount:8000,remark:''}]}],
   periods:[{no:1,date:'2026-09-10',prog:{za:{p:1,q:1}}}], curPeriod:0, createdAt:5 },
 // 不同廠商，不該出現在合併清單
 { id:'kX', parentId:'m1', name:'鑫喆商旅-別家', vendor:'別家', taxMode:'excl',
   blocks:[], periods:[{no:1,date:'2026-09-01',prog:{}}], curPeriod:0, createdAt:6 }
], cur:'kJ', tab:'prog'};

async function open(br){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},seed);
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1300);
  await p.evaluate(()=>{window.print=function(){};});
  await p.click('#btn-print'); await p.waitForTimeout(900);
  return {p,errs};
}
const DOC=p=>p.evaluate(()=>{const el=document.querySelector('#print-overlay .pcontent');return el?el.innerText.replace(/\s+/g,' '):'';});

(async()=>{
  const br=await chromium.launch();

  // ══ ① 列出同一廠商在別處的本期金額 ══
  {
    const {p,errs}=await open(br);
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    const boxes=await p.evaluate(()=>[...document.querySelectorAll('[data-mergejob]')]
      .map(x=>x.closest('label').innerText.replace(/\s+/g,' ').trim()));
    ok(boxes.length===2,'★★ 找到 2 筆同廠商的其他工程（實際 '+boxes.length+'）：'+JSON.stringify(boxes));
    ok(boxes.some(x=>/文心大樓 \/ 文心大樓-進凱/.test(x)),'★ 正式案場的子專案列得出來');
    ok(boxes.some(x=>/零星工程/.test(x)),'★★ 沒有母專案的零星工程也列得出來');
    ok(!boxes.some(x=>/別家/.test(x)),'★★ 不同廠商不會混進來');
    await p.close();
  }

  // ══ ② 不勾＝單子完全照舊 ══
  {
    const {p}=await open(br);
    const d=await DOC(p);
    ok(!/本次合併付款/.test(d),'② 沒勾的時候單子上不會多出東西');
    await p.close();
  }

  // ══ ③ 勾了就併進同一張單，並列出合計 ══
  {
    const {p}=await open(br);
    await p.evaluate(()=>{document.querySelectorAll('[data-mergejob]').forEach(cb=>{cb.checked=true;cb.onchange();});});
    await p.waitForTimeout(600);
    const d=await DOC(p);
    ok(/四、本次合併付款/.test(d),'③ 單子上多了「本次合併付款」那一段');
    ok(/文心大樓/.test(d)&&/零星工程/.test(d),'★ 兩筆都印出來了');
    ok(/各案場分別計稅/.test(d),'★★ 標題就寫明「各案場分別計稅」');
    const cols3=await p.evaluate(()=>{
      const div=[...document.querySelectorAll('#print-overlay .pcontent div')].find(x=>!x.children.length&&/本次合併付款/.test(x.textContent||''));
      const tb=div&&div.nextElementSibling;
      return tb&&tb.tagName==='TABLE'?[...tb.querySelectorAll('th')].map(x=>x.textContent.trim()):null;});
    ok(cols3&&cols3.some(x=>/營業稅/.test(x)),'★★ 有含稅專案時合併表出現營業稅欄（'+JSON.stringify(cols3)+'）');
    // 文心 12,000×4×0.5＝24,000 未稅，稅 1,200
    ok(/\$24,000/.test(d)&&/\$1,200/.test(d),'★★ 文心逐筆列出未稅 24,000 與稅額 1,200');
    // 零星 8,000 未稅、暫扣 10% → 實付 7,200
    ok(/\$7,200/.test(d),'★★ 零星工程扣掉自己的暫扣款 10% 後實付 7,200');
    // 合計未稅 84,000+24,000+8,000＝116,000
    ok(/\$116,000/.test(d),'★★ 未稅合計 116,000');
    ok(/各案場的金額與發票請分別開立/.test(d),'★★ 明寫發票要分開開立');
    ok(/已各自扣除該案場的暫扣款／保留款/.test(d),'★ 說明其他案場的實付已扣自己的暫扣／保留');
    await p.close();
  }

  // ══ ④ 只勾一筆也算得對 ══
  {
    const {p}=await open(br);
    await p.evaluate(()=>{const cb=[...document.querySelectorAll('[data-mergejob]')].find(x=>/零星/.test(x.closest('label').innerText));
      cb.checked=true;cb.onchange();});
    await p.waitForTimeout(600);
    const d=await DOC(p);
    ok(/零星工程/.test(d)&&/\$7,200/.test(d),'④ 只勾零星工程：實付 7,200（已扣自己的暫扣 10%）');
    ok(!/文心大樓/.test(d),'★ 沒勾的文心不會印出來');
    const cols=await p.evaluate(()=>{
      const div=[...document.querySelectorAll('#print-overlay .pcontent div')].find(x=>!x.children.length&&/本次合併付款/.test(x.textContent||''));
      const tb=div&&div.nextElementSibling;
      return tb&&tb.tagName==='TABLE'?[...tb.querySelectorAll('th')].map(x=>x.textContent.trim()):null;});
    ok(cols&&!cols.some(x=>/營業稅/.test(x)),'★★ 兩邊都是未稅專案時，合併表不會多出用不到的稅額欄（欄位：'+JSON.stringify(cols)+'）');
    await p.close();
  }

  // ══ ⑤ 資料完全沒被動到 ══
  {
    const {p}=await open(br);
    const before=await p.evaluate(()=>JSON.stringify(state.projects.map(x=>({id:x.id,per:x.periods.length,set:x.periods.map(q=>q.settled??null)}))));
    await p.evaluate(()=>{document.querySelectorAll('[data-mergejob]').forEach(cb=>{cb.checked=true;cb.onchange();});});
    await p.waitForTimeout(600);
    const after=await p.evaluate(()=>JSON.stringify(state.projects.map(x=>({id:x.id,per:x.periods.length,set:x.periods.map(q=>q.settled??null)}))));
    ok(before===after,'⑤ 勾選合併只影響列印，沒有動到任何專案的資料');
    const k=await p.evaluate(()=>calc(state.projects.find(x=>x.id==='kJ'),0).billActual);
    ok(k===84000,'★★ 本案場自己的請款金額還是 84,000（別處的錢沒被記進來）');
    await p.close();
  }

  // ⑥ 母專案（對業主那份）不該出現合併選項
  {
    const p=await br.newPage(); p.on('dialog',d=>d.accept());
    await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
    // 兩個母專案的「廠商」都是自己公司東澤——不能讓它們互相認親
    await p.addInitScript(s=>{s.cur='m1';localStorage.setItem('pm_progress_v1',JSON.stringify(s));
      localStorage.setItem('pm_e2e_key_v1','x');},seed);
    await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1300);
    await p.evaluate(()=>{ // 母專案要有期別才印得出來
      const m=state.projects.find(x=>x.id==='m1');
      m.periods=[{no:1,date:'2026-09-01',prog:{ma:{p:0.25,q:120}}}]; m.curPeriod=0; save(); render();});
    await p.waitForTimeout(500);
    await p.evaluate(()=>{window.print=function(){};});
    await p.click('#btn-print'); await p.waitForTimeout(900);
    const n=await p.evaluate(()=>document.querySelectorAll('[data-mergejob]').length);
    ok(n===0,'⑥ 母專案（對業主）不顯示合併選項——不然每個案場都會互相認親（實際 '+n+' 個）');
    const jobs=await p.evaluate(()=>sameVendorJobs(state.projects.find(x=>x.id==='m1')).length);
    ok(jobs===0,'★★ sameVendorJobs 對母專案回傳空的');
    await p.close();
  }

  // ⑦ 候選也不會挑到母專案
  {
    const {p}=await open(br);
    const has=await p.evaluate(()=>sameVendorJobs(state.projects.find(x=>x.id==='kJ'))
      .some(x=>!x.proj.parentId&&state.projects.some(y=>y.parentId===x.proj.id)));
    ok(!has,'⑦ 候選清單裡不會混進母專案');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
