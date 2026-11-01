// 「第四期什麼進度都還沒填，怎麼會突然跑出兩萬七」——把本次應請拆成三塊講清楚
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// A 項目 100㎡ × $300（1 式 ＝ $30,000）
// 第1期做 30%、第2期 60%、第3期 90%，各期都結算鎖在 $9,000
// 之後把單價改成 $600（覆核調價）→ 累計該請變成 $54,000，但舊期鎖住不動
// 第4期進度整份沿用第3期（什麼都沒填）→ 54,000 − 27,000 ＝ 本次應請 $27,000
const seed=(price,extraPeriod)=>{
  const periods=[
    {id:'p1',no:1,date:'2026-08-31',prog:{a1:{p:0.3,q:30}},settled:9000},
    {id:'p2',no:2,date:'2026-09-30',prog:{a1:{p:0.6,q:60}},settled:9000},
    {id:'p3',no:3,date:'2026-10-31',prog:{a1:{p:0.9,q:90}},settled:9000}];
  if(extraPeriod) periods.push({id:'p4',no:4,date:'2026-11-01',prog:{a1:{p:0.9,q:90}}});
  return {savedAt:Date.now(),tab:'prog',cur:'P',projects:[
    {id:'P',name:'凱子-代工',taxMode:'excl',signedTotal:0,curPeriod:periods.length-1,
     blocks:[{id:'bA',name:'公共區',unit:'式',count:1,items:[
       {id:'a1',no:'A',name:'A 項目',unit:'㎡',qty:100,price,amount:100*price}]}],
     periods}]};
};

(async()=>{
const br=await chromium.launch();
const open=async st=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  pg.on('dialog',async d=>{ await d.accept(); });
  return {pg,errs};
};
const clean=s=>s.replace(/\s+/g,' ');

// ① 他的情境：第4期沒填進度，卻有 $27,000
{
  const {pg,errs}=await open(seed(600,true));
  const n=await pg.evaluate(()=>{
    const p=curProj(), c=calc(p,3), prev=calc(p,2);
    return {computed:c.billComputed,actual:c.billActual,cum:c.cumApplied,
      prevCum:prev.cumApplied,pre:c.billPre,
      本期增加:Math.round(c.cumApplied)-Math.round(prev.cumApplied)};
  });
  t('① 重現：第4期本次應請 $27,000', n.computed===27000);
  t('① ★ 而本期進度增加是 0（他真的什麼都沒填）', n.本期增加===0);
  t('① 前期累計已收 $27,000（三期各 $9,000）', n.pre===27000);

  const app=clean(await pg.textContent('#app'));
  t('① ★ 畫面直接寫「這筆錢是哪來的？」', /這筆錢是哪來的/.test(app));
  t('① ★ 本期進度增加列 $0', /本期進度增加\$0/.test(app));
  t('① ★ 前期結轉列 $27,000，而且寫出是第 1–3 期',
    /前期結轉（第 1–3 期該請但還沒請到）\$27,000/.test(app));
  t('① ★ 寫出前面該請 $54,000、實際只請 $27,000',
    /該請 \$54,000/.test(app)&&/實際只請（含訂金）\$27,000/.test(app));
  t('① ★ 講出常見原因是鎖定後又改了數量／單價',
    /結算鎖定之後<\/b>?你又改了數量／單價／間數／折讓|結算鎖定之後.{0,4}你又改了數量/.test(clean(await pg.innerHTML('#app'))));
  t('① ★ 明說「這是設計，不是算錯」', /這是設計，不是算錯/.test(app));
  t('① 有指路到「對帳檢查」與「結算鎖定本期」',
    /對帳檢查/.test(app)&&/結算鎖定本期/.test(app));
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② 對得起來的時候不要囉嗦（沒改過單價＝沒有結轉）
{
  const {pg,errs}=await open(seed(300,true));
  const n=await pg.evaluate(()=>{ const p=curProj(); return calc(p,3).billComputed; });
  t('② 沒改過單價時第4期是 $0', n===0);
  t('② ★ 不顯示「這筆錢是哪來的」（沒結轉就不囉嗦）',
    !/這筆錢是哪來的/.test(await pg.textContent('#app')));
  t('② 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ③ 反過來：前面多請了，本期是負的沖銷
{
  const st=seed(600,true);
  st.projects[0].blocks[0].items[0].price=100;      // 單價砍到 $100 → 累計該請只剩 $9,000
  st.projects[0].blocks[0].items[0].amount=10000;
  const {pg,errs}=await open(st);
  const n=await pg.evaluate(()=>calc(curProj(),3).billComputed);
  t('③ 本次應請是負的（前面多請）', n<0);
  const app=clean(await pg.textContent('#app'));
  t('③ ★ 一樣講得出來是前期結轉，而且說是「前面多請了」',
    /這筆錢是哪來的/.test(app)&&/前面多請了/.test(app));
  t('③ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ④ 本期加項要單獨列出來，不要混進「前期結轉」
{
  const st=seed(600,true);
  st.projects[0].periods[3].extras=[{id:'e1',name:'加做隔間',amount:5000,date:'2026-11-01'}];
  const {pg,errs}=await open(st);
  const app=clean(await pg.textContent('#app'));
  t('④ ★ 本期加項單獨一列 $5,000', /本期加項\$5,000/.test(app));
  t('④ ★ 前期結轉還是 $27,000（加項沒被算進去）',
    /前期結轉（第 1–3 期該請但還沒請到）\$27,000/.test(app));
  t('④ 本次應請 $32,000（27,000 ＋ 5,000）',
    await pg.evaluate(()=>calc(curProj(),3).billComputed)===32000);
  t('④ 三塊加起來等於本次應請', /本次應請\$32,000/.test(app));
  t('④ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑤ 本期真的有填進度時，進度那一塊要算對（不要全部塞進結轉）
{
  const st=seed(600,true);
  st.projects[0].periods[3].prog={a1:{p:1,q:100}};   // 第4期從 90% 做到 100% → 增加 $6,000
  const {pg,errs}=await open(st);
  const app=clean(await pg.textContent('#app'));
  t('⑤ ★ 本期進度增加 $6,000（90%→100%，單價 600）', /本期進度增加\$6,000/.test(app));
  t('⑤ ★ 前期結轉仍是 $27,000', /前期結轉（第 1–3 期該請但還沒請到）\$27,000/.test(app));
  t('⑤ 本次應請 $33,000', await pg.evaluate(()=>calc(curProj(),3).billComputed)===33000);
  t('⑤ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑥ 第1期（沒有前期）不會算出假的結轉
{
  const st=seed(600,false);
  st.projects[0].periods=[{id:'p1',no:1,date:'2026-08-31',prog:{a1:{p:0.3,q:30}}}];
  st.projects[0].curPeriod=0;
  const {pg,errs}=await open(st);
  const app=clean(await pg.textContent('#app'));
  t('⑥ 第1期不顯示「這筆錢是哪來的」', !/這筆錢是哪來的/.test(app));
  t('⑥ 第1期應請＝本期完成 $18,000（100㎡×0.3×600）',
    await pg.evaluate(()=>calc(curProj(),0).billComputed)===18000);
  t('⑥ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
