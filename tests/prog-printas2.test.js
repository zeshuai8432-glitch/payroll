// 「印作」：發包時要帶過去、單條也要生效、可批次設定
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// A＝代工母專案，一條對一條（不合併），三條都要印成「雙面隔間」
const seed=()=>({savedAt:Date.now(),tab:'items',cur:'A',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,trash:[],periods:[],blocks:[
    {id:'bA',name:'TYPE-EXS',unit:'間',count:3,items:[
      {id:'i1',no:'6.1',name:'雙面隔間-C型鋼骨架',unit:'㎡',qty:10,price:120,amount:1200,printAs:'雙面隔間'},
      {id:'i2',no:'6.2',name:'雙面隔間-封矽酸鈣板',unit:'㎡',qty:10,price:100,amount:1000,printAs:'雙面隔間'},
      {id:'i3',no:'6.3',name:'雙面隔間-填充岩棉',unit:'㎡',qty:10,price:80,amount:800,printAs:'雙面隔間'},
      {id:'i4',no:'6.9',name:'淋浴間壁龕單面壁板；含C65輕鋼骨架H:2600',unit:'㎡',qty:2.5,price:280,amount:700,printAs:'壁龕'},
      {id:'i5',no:'6.20',name:'走道天花封板',unit:'㎡',qty:8,price:260,amount:2080}]}]}]});

(async()=>{
const br=await chromium.launch();
const open=async st=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(700);
  return {pg,errs};
};

// ① 建立廠商子專案要把印作帶過去
{
  const {pg,errs}=await open(seed());
  await pg.evaluate(()=>{ state.tab='set'; render(); }); await pg.waitForTimeout(250);
  await pg.fill('#dup-name','凱子-代工-B班'); await pg.fill('#dup-vendor','B班');
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.click('#proj-dup'); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>{const k=state.projects.find(p=>p.parentId==='A');
    return k.blocks[0].items.map(x=>({n:x.name,pa:x.printAs||'',src:x.srcId}));});
  t('① 發包後印作跟著過去', r.filter(x=>x.pa==='雙面隔間').length===3&&r.find(x=>x.n.startsWith('淋浴')).pa==='壁龕');
  t('① 沒有印作的那條不會被亂加', r.find(x=>x.n==='走道天花封板').pa==='');
  t('① 溯源仍在（抓長補短對得回去）', r.every(x=>!!x.src));
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② 從母專案補細項、發包給工班，也要帶
{
  const {pg}=await open(seed());
  const got=await pg.evaluate(()=>{
    // 模擬「從母專案補細項」與「發包給工班」會走到的那兩段原始碼是否含 printAs
    const src=document.documentElement.innerHTML;
    return { back:/remark:it\.remark\|\|'', srcId:it\.id,\s*\.\.\.\(it\.printAs/.test(src),
             sub:/remark:note\|\|it\.remark\|\|'', srcId:it\.id,\s*\.\.\.\(it\.printAs/.test(src) };
  });
  t('② 從母專案補細項帶印作', got.back);
  t('② 發包給工班帶印作', got.sub);
  await pg.close();
}

// ③ 列印：三條併成一行、金額加總、底下列出含哪幾條
{
  const {pg}=await open(seed());
  pg.on('dialog',async d=>{ await d.dismiss(); });
  await pg.evaluate(()=>{
    const p=state.projects[0];
    p.periods=[{id:'p1',no:1,date:'2026-10-01',prog:{i1:{p:1,q:10},i2:{p:1,q:10},i3:{p:1,q:10},i4:{p:1,q:2.5},i5:{p:1,q:8}}}];
    p.curPeriod=0; state.tab='prog'; window.print=function(){}; render();
  }); await pg.waitForTimeout(400);
  await pg.click('#btn-print'); await pg.waitForTimeout(900);
  const doc=await pg.evaluate(()=>{const el=document.querySelector('#print-overlay .pcontent');return el?el.innerText.replace(/\s+/g,' '):'';});
  t('③ 併成一行「雙面隔間」', /雙面隔間/.test(doc));
  t('③ 底下列出含哪幾條', /含.*C型鋼骨架.*封矽酸鈣板.*填充岩棉/.test(doc.replace(/ /g,'')));
  // 併出來的金額＝1200+1000+800=3000（每間），×3 間
  const amt=await pg.evaluate(()=>{
    const rows=[...document.querySelectorAll('#print-overlay .pcontent table tr')];
    const r=rows.find(x=>/雙面隔間/.test(x.textContent)&&!/含/.test(x.children[0]?.textContent||''));
    return r?[...r.querySelectorAll('td')].map(td=>td.textContent.trim()):null;});
  t('③ 合併那行金額是三條加總 3,000（實際 '+(amt?amt[5]:'?')+'）', !!amt&&/3,?000/.test(amt[5]));
  t('③ 單價欄留空（三條單價不同，印一個會誤導）', !!amt&&amt[4]==='—');
  // 單條印作＝純改名：印出來是「壁龕」，不是原本那串
  t('③ 單條印作當純改名用：印出「壁龕」', /壁龕/.test(doc));
  t('③ 不再印原本那串長名稱', !/淋浴間壁龕單面壁板/.test(doc));
  t('③ 沒設印作的照原名印', /走道天花封板/.test(doc));
  await pg.close();
}

// ④ 批次設定
{
  const st=seed(); st.projects[0].blocks[0].items.forEach(x=>delete x.printAs);
  const {pg,errs}=await open(st);
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.evaluate(()=>{ openBlk.add('bA'); render(); }); await pg.waitForTimeout(250);
  await pg.click('[data-delmode="bA"]'); await pg.waitForTimeout(250);
  t('④ 工具列有批次設印作的欄位', await pg.locator('#pa-bA').count()===1);
  for(const id of ['i1','i2','i3']) await pg.click(`[data-delpick="${id}"]`);
  await pg.waitForTimeout(200);
  t('④ 按鈕條數會跟著勾選更新', /設給勾選的 3 條/.test(await pg.textContent('[data-pado="bA"]')));
  await pg.fill('#pa-bA','雙面隔間');
  await pg.click('[data-pado="bA"]'); await pg.waitForTimeout(500);
  const r=await pg.evaluate(()=>state.projects[0].blocks[0].items.map(x=>x.printAs||''));
  t('④ 三條一次設好', r[0]==='雙面隔間'&&r[1]==='雙面隔間'&&r[2]==='雙面隔間');
  t('④ 沒勾的不受影響', r[3]===''&&r[4]==='');
  const r2=await pg.evaluate(()=>state.projects[0].blocks[0].items.map(x=>({q:x.qty,p:x.price,a:x.amount})));
  t('④ 數量單價金額一律不動（抓長補短不受影響）',
    r2[0].q===10&&r2[0].p===120&&r2[0].a===1200&&r2[2].a===800);
  t('④ 沒有 JS 錯誤', errs.length===0);

  // 清掉
  await pg.evaluate(()=>{ openBlk.add('bA'); render(); }); await pg.waitForTimeout(200);
  await pg.click('[data-delmode="bA"]'); await pg.waitForTimeout(250);
  await pg.click('[data-delpick="i1"]'); await pg.waitForTimeout(150);
  await pg.click('[data-paclear="bA"]'); await pg.waitForTimeout(450);
  const r3=await pg.evaluate(()=>state.projects[0].blocks[0].items.map(x=>x.printAs||''));
  t('④ 清掉只清勾選那條', r3[0]===''&&r3[1]==='雙面隔間');
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
