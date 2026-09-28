const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

// 母專案 TYPE-SK 40 間；子專案「進凱」只從鑫那邊撥到 3 間，
// 另外幾個區塊是照抄架構但沒細項
const seed={ projects:[
 { id:'m1', name:'鑫喆商旅', owner:'鑫喆', vendor:'東澤', taxMode:'excl',
   blocks:[{id:'mb1',name:'TYPE-SK 標準大床',unit:'間',count:40,items:[
     {id:'ma',no:'6.1',name:'骨架',unit:'㎡',qty:40,price:1000,amount:40000,remark:''}]},
     {id:'mb2',name:'TYPE-EXS 行政套房',unit:'間',count:5,items:[
     {id:'mb',no:'6.2',name:'天花',unit:'㎡',qty:10,price:500,amount:5000,remark:''}]}],
   periods:[], curPeriod:0, createdAt:1 },
 { id:'kJ', parentId:'m1', name:'鑫喆商旅-進凱', vendor:'進凱', taxMode:'excl',
   blocks:[
     // 撥過來的：區塊間數照抄 40，但這條只做 3 間
     {id:'jb1',name:'TYPE-SK 標準大床',unit:'間',count:40,srcBlk:'mb1',items:[
       {id:'ja',no:'6.1',name:'骨架',unit:'㎡',qty:40,price:700,amount:28000,remark:'',srcId:'ma',cnt:3}]},
     // 照抄架構但沒細項
     {id:'jb2',name:'TYPE-EXS 行政套房',unit:'間',count:5,srcBlk:'mb2',items:[]},
     {id:'jb3',name:'廊道 / 客用電梯廳',unit:'層',count:6,items:[]}],
   periods:[{no:1,date:'2026-09-01',prog:{}}], curPeriod:0, createdAt:2 }
], cur:'kJ', tab:'items'};

async function open(br,cur){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},
    {...seed,cur:cur||seed.cur});
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1200);
  const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
  return {p,errs,t};
}

(async()=>{
  const br=await chromium.launch();

  // ══ ① 子專案：顯示這家真正做的間數，不是照抄的 40 ══
  {
    const {p,errs,t}=await open(br);
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    ok(/3 間/.test(t),'★★ TYPE-SK 顯示「3 間」（進凱實際撥到的）');
    ok(/合約 40/.test(t),'★ 旁邊小字註明合約是 40 間，不會以為資料錯了');
    const perUnit=await p.evaluate(()=>{
      const el=[...document.querySelectorAll('summary')].find(x=>/TYPE-SK/.test(x.innerText));
      return el?el.innerText.replace(/\s+/g,' '):'';});
    ok(/每間 \$9,333|每間 \$9,333/.test(perUnit)||/每間/.test(perUnit),'★ 有「每間」標籤：'+perUnit.slice(0,60));
    ok(!/每間 \$700\b/.test(perUnit),'★★ 每間不再用 40 當分母（28,000×3÷40＝2,100 那種怪數字）');
    await p.close();
  }

  // ══ ② 子專案預設隱藏沒細項的區塊，而且講明藏了幾個 ══
  {
    const {p,t}=await open(br);
    ok(!/行政套房/.test(t),'★★ 沒細項的「TYPE-EXS 行政套房」預設不顯示');
    ok(!/廊道/.test(t),'★★ 「廊道 / 客用電梯廳」也不顯示');
    ok(/已隱藏 2 個沒有細項的區塊/.test(t),'★★ 明講藏了 2 個');
    ok(/沒有刪掉/.test(t),'★★ 而且說明沒有刪掉，不會以為資料不見');
    ok(/隱藏沒有細項的區塊（2 個）/.test(t),'★ 勾選框標了數量');
    await p.close();
  }

  // ══ ③ 取消勾選就全部看得到 ══
  {
    const {p}=await open(br);
    await p.click('#hide-empty-blk'); await p.waitForTimeout(600);
    const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
    ok(/行政套房/.test(t)&&/廊道/.test(t),'③ 取消勾選，空區塊就出現了');
    ok(/沒有細項/.test(t),'★ 空區塊標「沒有細項」');
    const saved=await p.evaluate(()=>curProj().hideEmptyBlk);
    ok(saved===false,'★ 選擇有存起來（'+saved+'）');
    await p.close();
  }

  // ══ ④ 母專案是總表，預設全部顯示 ══
  {
    const {p,t}=await open(br,'m1');
    ok(/行政套房/.test(t),'④ 母專案不隱藏（它是發包總表，要看得到全部）');
    ok(/40 間/.test(t),'★ 母專案照常顯示 40 間');
    ok(!/合約 40/.test(t),'★ 母專案不會多出「合約 40」那個註記');
    await p.close();
  }

  // ══ ⑤ 同區塊多條、間數不一樣時不要硬算每間 ══
  {
    const p=await br.newPage(); p.on('dialog',d=>d.accept());
    await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
    await p.addInitScript(s=>{
      s.projects[1].blocks[0].items.push({id:'jb',no:'6.9',name:'補強',unit:'㎡',qty:5,price:400,amount:2000,remark:'',cnt:7});
      localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},seed);
    await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1200);
    const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
    ok(/多種間數（最多 7 間）/.test(t),'⑤ 各條間數不一樣時標「多種間數（最多 7 間）」');
    ok(!/每間 \$/.test(t.split('TYPE-SK')[1]||''),'★★ 這種情況不硬算「每間」（算了會誤導）');
    await p.close();
  }

  // ══ ⑥ 進度請款頁要跟合約明細一致 ══
  {
    const {p,errs}=await open(br);
    await p.evaluate(()=>{state.tab='prog';render();curProj().blocks.forEach(b=>openBlk.add(b.id));render();});
    await p.waitForTimeout(600);
    const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
    ok(errs.length===0,'⑥ 進度頁無 JS 錯誤'+(errs.length?'：'+errs[0]:''));
    ok(/3 間/.test(t),'★★ 進度頁區塊標題也顯示「3 間」（不是 40）');
    ok(/合約 40/.test(t),'★ 一樣註明合約 40');
    ok(!/行政套房/.test(t)&&!/廊道/.test(t),'★★ 進度頁也收掉沒細項的區塊');
    ok(/隱藏沒細項的區塊（2 個）/.test(t),'★ 進度頁也有同一個開關');
    ok(/共 3 間，合約 40/.test(t),'★★ 完成間數欄的表頭改成「共 3 間，合約 40」');
    ok(/那條自己的間數/.test(t),'★★ 整批填說明改成「各自換算：完成間數 ÷ 那條自己的間數」');
    await p.close();
  }

  // ══ ⑦ 進度頁的開關跟合約明細連動 ══
  {
    const {p}=await open(br);
    await p.evaluate(()=>{state.tab='prog';render();}); await p.waitForTimeout(500);
    await p.click('#hide-empty-blk'); await p.waitForTimeout(600);
    let t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
    ok(/行政套房/.test(t),'⑦ 在進度頁取消勾選，空區塊出現');
    await p.evaluate(()=>{state.tab='items';render();}); await p.waitForTimeout(500);
    t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
    ok(/行政套房/.test(t),'★★ 切回合約明細也是顯示的（兩頁同一個設定）');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
