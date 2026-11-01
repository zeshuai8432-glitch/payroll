// 保留款／暫扣款「部分放款」：填一個金額就好，不用整期整期放
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 他的實際狀況：四期，保留款 12,429 ／ 5,588 ／ 18,017 ／ 0，合計 36,034
// 暫扣 3%：3,786 ／ 10,070 ／ 6,063 ／ 343，合計 20,262
const seed=()=>({savedAt:Date.now(),tab:'prog',cur:'P',projects:[
  {id:'P',name:'凱子-代工',vendor:'甲',taxMode:'excl',signedTotal:0,
   withholdPct:3,invoiceTaxPct:5,curPeriod:3,
   blocks:[{id:'bA',name:'公共區',unit:'式',count:1,items:[
     {id:'a1',no:'A',name:'A 項目',unit:'㎡',qty:1000,price:700,amount:700000}]}],
   periods:[
     {id:'p1',no:1,date:'2026-08-01',prog:{a1:{p:0.18,q:180}},settled:126215,rtAmt:12429},
     {id:'p2',no:2,date:'2026-09-01',prog:{a1:{p:0.4796,q:479.6}},settled:335658,rtAmt:5588},
     {id:'p3',no:3,date:'2026-10-01',prog:{a1:{p:0.6683,q:668.3}},settled:202101,rtAmt:18017},
     {id:'p4',no:4,date:'2026-11-01',prog:{a1:{p:0.6847,q:684.7}},settled:11442,rtAmt:0}]}]});

(async()=>{
const br=await chromium.launch();
const open=async st=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  return {pg,errs};
};
const held=pg=>pg.evaluate(()=>heldOf(curProj(),3));
const printDocOf=pg=>pg.evaluate(()=>{
  const p=curProj();
  document.getElementById('print-overlay').innerHTML='';
  printDoc(p);
  const h=document.querySelector('#print-overlay .pcontent').innerHTML;
  document.getElementById('print-overlay').innerHTML='';
  document.body.classList.remove('printing');
  return h;
});

// ① 放款前：手上押著保留款 36,034、暫扣款 20,262
{
  const {pg,errs}=await open(seed());
  pg.on('dialog',async d=>{ await d.accept(); });
  const h=await held(pg);
  t('① 保留款未放款 36,034', h.rt===36034);
  t('① 暫扣款未退還 20,262', h.wh===20262);
  t('① ★ 有「放保留款」與「退暫扣款」兩顆鈕',
    await pg.locator('#btn-payrt').count()===1&&await pg.locator('#btn-paywh').count()===1);
  const txt=await pg.textContent('#app');
  t('① 面板寫出未放款金額與「可以只放一部分」',
    /可以只放一部分/.test(txt)&&/36,034/.test(txt));
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② ★ 放一部分：36,034 裡先放 20,000
{
  const {pg,errs}=await open(seed());
  const before=await pg.evaluate(()=>calc(curProj(),3).billActual);
  const prompts=[];
  pg.on('dialog',async d=>{
    if(d.type()!=='prompt'){ await d.accept(); return; }
    prompts.push(d.message());
    await d.accept(prompts.length===1?'20000':'匯款');
  });
  await pg.click('#btn-payrt'); await pg.waitForTimeout(600);
  t('② 輸入框帶出上限 36,034 並說明會併進第 4 期',
    /還押著 \$36,034/.test(prompts[0])&&/第 4 期/.test(prompts[0]));
  const r=await pg.evaluate(()=>{
    const p=curProj(), rel=releasedInPeriod(p,3), h=heldOf(p,3), c=calc(p,3);
    const wp=Math.max(0,Number(p.withholdPct)||0);
    const wh=withholdOf(p,p.periods[3],c.billActual), rt=retainOf(p,p.periods[3],c.billActual);
    return {n:(p.payouts||[]).length, kind:(p.payouts||[])[0].kind, amt:(p.payouts||[])[0].amount,
      note:(p.payouts||[])[0].note, inPeriod:(p.payouts||[])[0].inPeriod,
      relRt:rel.rt, relPart:rel.rtPart, heldRt:h.rt,
      實請:c.billActual, 實付:c.billActual-wh-rt+rel.rt+rel.wh};
  });
  t('② ★ 記下一筆保留款放款 20,000，併在第 4 期',
    r.n===1&&r.kind==='rt'&&r.amt===20000&&r.inPeriod===4);
  t('② 備註也記下來了（匯款）', r.note==='匯款');
  t('② ★ 本期的「退還保留款」＝20,000', r.relRt===20000&&r.relPart===20000);
  t('② ★ 未放款剩 16,034（36,034 − 20,000）', r.heldRt===16034);
  t('② ★ 本次實請金額完全沒變（11,442）', r.實請===before&&r.實請===11442);
  t('② ★ 本次實付多了 20,000',
    r.實付===11442-343-0+20000);
  const txt=await pg.textContent('#app');
  t('② 畫面上「＋ 退還保留款（部分放款）」', /退還保留款（部分放款）/.test(txt));
  t('② 放款紀錄列出那一筆', /保留款放款/.test(txt)&&/20,000/.test(txt));
  t('② 沒有 JS 錯誤', errs.length===0);

  // 列印
  const doc=await printDocOf(pg);
  t('② ★ 列印有「退還保留款（部分放款）」+20,000',
    /退還保留款（部分放款）/.test(doc)&&/\+20,000/.test(doc));
  t('② ★ 列印的「尚未領取之款項」保留款變 16,034',
    /16,034/.test(doc)&&!/36,034/.test(doc));
  t('② 列印的本次實請還是 11,442', /11,442/.test(doc));
  await pg.close();
}

// ③ 再放一筆，剩下的全放完
{
  const {pg}=await open(seed());
  let i=0;
  pg.on('dialog',async d=>{
    if(d.type()!=='prompt'){ await d.accept(); return; }
    i++; await d.accept(i===1?'20000':(i===2?'':(i===3?'16034':'')));
  });
  await pg.click('#btn-payrt'); await pg.waitForTimeout(600);
  await pg.click('#btn-payrt'); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>{
    const p=curProj(), h=heldOf(p,3), rel=releasedInPeriod(p,3);
    return {n:(p.payouts||[]).length, sum:payoutSum(p,'rt'), heldRt:h.rt, relRt:rel.rt};
  });
  t('③ 兩筆共 36,034，全部放完', r.n===2&&r.sum===36034&&r.heldRt===0);
  t('③ 本期退還保留款合計 36,034', r.relRt===36034);
  t('③ 放完之後「放保留款」鈕禁用',
    await pg.getAttribute('#btn-payrt','disabled')!==null);
  await pg.close();
}

// ④ 刪掉放款紀錄，金額回去
{
  const {pg}=await open(seed());
  let i=0;
  pg.on('dialog',async d=>{ if(d.type()==='prompt'){ i++; await d.accept(i===1?'20000':''); } else await d.accept(); });
  await pg.click('#btn-payrt'); await pg.waitForTimeout(600);
  const id=await pg.evaluate(()=>curProj().payouts[0].id);
  await pg.click(`[data-payoutdel="${id}"]`); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>({n:(curProj().payouts||[]).length, heldRt:heldOf(curProj(),3).rt,
    rel:releasedInPeriod(curProj(),3).rt}));
  t('④ ★ 刪掉之後紀錄沒了、未放款回到 36,034、本期不再退還',
    r.n===0&&r.heldRt===36034&&r.rel===0);
  await pg.close();
}

// ⑤ 暫扣款也能部分退還
{
  const {pg,errs}=await open(seed());
  let i=0;
  pg.on('dialog',async d=>{ if(d.type()==='prompt'){ i++; await d.accept(i===1?'10000':'補開發票第一批'); } else await d.accept(); });
  await pg.click('#btn-paywh'); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>{
    const p=curProj(), h=heldOf(p,3), rel=releasedInPeriod(p,3);
    return {kind:p.payouts[0].kind, amt:p.payouts[0].amount, heldWh:h.wh, relWh:rel.wh, relPart:rel.whPart};
  });
  t('⑤ ★ 退還暫扣款 10,000，未退還剩 10,262',
    r.kind==='wh'&&r.amt===10000&&r.heldWh===10262);
  t('⑤ 本期「退還暫扣款」＝10,000', r.relWh===10000&&r.relPart===10000);
  const doc=await printDocOf(pg);
  t('⑤ 列印有「退還暫扣款（部分退還）」', /退還暫扣款（部分退還）/.test(doc));
  t('⑤ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑥ 填超過手上押著的金額會先問，而且「還欠廠商」不會變負數
{
  const {pg}=await open(seed());
  let i=0; const msgs=[];
  pg.on('dialog',async d=>{
    if(d.type()==='prompt'){ i++; await d.accept(i===1?'50000':''); return; }
    msgs.push(d.message()); await d.accept();
  });
  await pg.click('#btn-payrt'); await pg.waitForTimeout(700);
  t('⑥ ★ 有警告「比手上押著的還多」', msgs.some(m=>/比手上押著的/.test(m)));
  const r=await pg.evaluate(()=>heldOf(curProj(),3));
  t('⑥ ★ 未放款變 0，不會變負數', r.rt===0);
  await pg.close();
}

// ⑦ 整期標記放款與部分放款並存，不會重複算
{
  const st=seed();
  st.projects[0].periods[0].rtReleased=true;
  st.projects[0].periods[0].rtReleaseDate='2026-10-01';
  st.projects[0].periods[0].rtReleasedIn=4;
  const {pg}=await open(st);
  let i=0;
  pg.on('dialog',async d=>{ if(d.type()==='prompt'){ i++; await d.accept(i===1?'5000':''); } else await d.accept(); });
  const h0=await held(pg);
  t('⑦ 第1期整期標記放款後，未放款 23,605（36,034 − 12,429）', h0.rt===23605);
  await pg.click('#btn-payrt'); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>{
    const p=curProj(), rel=releasedInPeriod(p,3), h=heldOf(p,3);
    return {heldRt:h.rt, relRt:rel.rt, from:rel.rtFrom, part:rel.rtPart};
  });
  t('⑦ ★ 再部分放 5,000 → 未放款 18,605（沒有重複算）', r.heldRt===18605);
  t('⑦ ★ 本期退還合計 17,429（第1期 12,429 ＋ 部分 5,000）',
    r.relRt===17429&&r.from.join()==='1'&&r.part===5000);
  const txt=await pg.textContent('#app');
  t('⑦ 標籤寫「第 1 期＋部分放款」', /第 1 期＋部分放款/.test(txt));
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
