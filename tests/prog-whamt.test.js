// 暫扣款可以逐期直接指定金額：舊帳（資料重做過、當初％不同）要能照實記，
// 不然算出來的數字跟已經給廠商的請款單對不起來
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 他的真實舊帳（請款單上已經給廠商的累計數字）：
//   第1期 實請 126,215　暫扣 3,786　保留 12,429　合計暫留 16,215　實付 110,000
//   第2期 實請 330,070　暫扣 10,070　保留 5,588　→ 累計暫扣 13,856、累計保留 18,017
// 第2期的暫扣 10,070 不等於 330,070×3%（＝9,902），照％硬算就對不起來。
const seed=()=>({savedAt:Date.now(),tab:'prog',cur:'P',projects:[
  {id:'P',name:'凱子-代工',vendor:'甲',taxMode:'excl',signedTotal:0,
   withholdPct:3,invoiceTaxPct:5,curPeriod:1,
   blocks:[{id:'bA',name:'公共區',unit:'式',count:1,items:[
     {id:'a1',no:'A',name:'A 項目',unit:'㎡',qty:1000,price:700,amount:700000}]}],
   periods:[
     {id:'p1',no:1,date:'2026-08-01',prog:{a1:{p:0.18,q:180}},settled:126215},
     {id:'p2',no:2,date:'2026-09-01',prog:{a1:{p:0.66,q:660}},settled:330070}]}]});

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

// ① 沒指定時照舊按％算
{
  const {pg,errs}=await open(seed());
  const n=await pg.evaluate(()=>{
    const p=curProj();
    return {w1:withholdOf(p,p.periods[0],calc(p,0).billActual),
            w2:withholdOf(p,p.periods[1],calc(p,1).billActual),
            has:hasWithhold(p)};
  });
  t('① 第1期照 3% 算＝3,786（跟他的舊帳剛好一樣）', n.w1===3786);
  t('① 第2期照 3% 算＝9,902（但他舊帳是 10,070——對不起來）', n.w2===9902);
  t('① hasWithhold 認得出有在管暫扣', n.has===true);
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② ★ 直接指定金額，照指定的走
{
  const {pg,errs}=await open(seed());
  const n=await pg.evaluate(()=>{
    const p=curProj();
    p.periods[1].whAmt=10070;            // 照舊帳填
    p.periods[0].rtAmt=12429;
    p.periods[1].rtAmt=5588;
    save();
    const c0=calc(p,0), c1=calc(p,1);
    const w0=withholdOf(p,p.periods[0],c0.billActual), w1=withholdOf(p,p.periods[1],c1.billActual);
    const r0=retainOf(p,p.periods[0],c0.billActual), r1=retainOf(p,p.periods[1],c1.billActual);
    return {w0,w1,r0,r1,
      累計暫扣:w0+w1,累計保留:r0+r1,合計暫留:w0+w1+r0+r1,
      實付1:c0.billActual-w0-r0, 實付2:c1.billActual-w1-r1};
  });
  t('② ★ 第2期暫扣照指定的 10,070（不是 9,902）', n.w1===10070);
  t('② ★ 累計暫扣 13,856——跟他第2期請款單上的數字一樣', n.累計暫扣===13856);
  t('② ★ 累計保留 18,017——跟他第2期請款單上的數字一樣', n.累計保留===18017);
  t('② ★ 合計暫留 31,873——跟他第2期請款單上的數字一樣', n.合計暫留===31873);
  t('② ★ 第1期實付 110,000（126,215 − 3,786 − 12,429）', n.實付1===110000);
  t('② 第2期實付 314,412（330,070 − 10,070 − 5,588）', n.實付2===314412);
  t('② 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ③ 畫面：扣款追蹤那一欄可以直接打字，而且標明是直接指定
{
  const {pg,errs}=await open(seed());
  await pg.evaluate(()=>{ const p=curProj(); p.periods[0].rtAmt=12429; p.periods[1].rtAmt=5588; save(); render(); });
  await pg.waitForTimeout(400);
  t('③ 暫扣款欄是可以打字的輸入框', await pg.locator('[data-whamt="1"]').count()===1);
  t('③ 預設顯示照 3% 算的 9,902', await pg.inputValue('[data-whamt="1"]')==='9902');

  await pg.fill('[data-whamt="1"]','10070');
  await pg.dispatchEvent('[data-whamt="1"]','change');
  await pg.waitForTimeout(400);
  t('③ ★ 打完 10070 就存成直接指定', await pg.evaluate(()=>curProj().periods[1].whAmt)===10070);
  const txt=await pg.textContent('#app');
  t('③ ★ 標出「直接指定」並提供改回 3%', /直接指定/.test(txt)&&/改回 3%/.test(txt));
  t('③ ★ 累計暫扣顯示 13,856', /13,856/.test(txt));
  t('③ 說明有講「兩欄都可以直接打字改成當初實際扣的金額」',
    /兩欄都可以直接打字改成當初實際扣的金額/.test(txt));

  // 改回自動
  await pg.click('[data-whamtauto="1"]'); await pg.waitForTimeout(400);
  t('③ 按「改回 3%」就清掉指定值',
    await pg.evaluate(()=>curProj().periods[1].whAmt===undefined));
  t('③ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ④ 填的數字剛好等於％算出來的，就不要凍結（之後請款額變了金額要跟著走）
{
  const {pg}=await open(seed());
  await pg.evaluate(()=>{ const p=curProj(); p.periods[0].rtAmt=1; save(); render(); });
  await pg.waitForTimeout(300);
  await pg.fill('[data-whamt="1"]','9902');
  await pg.dispatchEvent('[data-whamt="1"]','change');
  await pg.waitForTimeout(400);
  t('④ ★ 填 9,902（＝3% 算出來的）不存成指定值，繼續跟著％走',
    await pg.evaluate(()=>curProj().periods[1].whAmt===undefined));
  await pg.close();
}

// ⑤ 列印請款單：直接指定時不印「3%」，金額照指定的
{
  const {pg,errs}=await open(seed());
  const doc=await pg.evaluate(()=>{
    const p=curProj();
    p.periods[1].whAmt=10070; p.periods[0].rtAmt=12429; p.periods[1].rtAmt=5588; save();
    let html=''; const real=window.printHTML;
    document.getElementById('print-overlay').innerHTML='';
    printDoc(p);
    html=document.querySelector('#print-overlay .pcontent').innerHTML;
    document.getElementById('print-overlay').innerHTML='';
    document.body.classList.remove('printing');
    return html;
  });
  t('⑤ ★ 暫扣款那行印 10,070', /10,070/.test(doc));
  t('⑤ ★ 直接指定時不印「暫扣款 3%」', !/暫扣款 3%/.test(doc));
  t('⑤ ★ 累計暫留印 31,873（13,856 ＋ 18,017）', /31,873/.test(doc));
  t('⑤ 本次實付印 314,412', /314,412/.test(doc));
  t('⑤ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑥ 退還暫扣款也要照指定金額退（不能退％算出來的）
{
  const {pg,errs}=await open(seed());
  const n=await pg.evaluate(()=>{
    const p=curProj();
    p.periods[1].whAmt=10070;
    p.periods[0].whRefunded=true; p.periods[0].whRefundedIn=2; p.periods[0].whRefundDate='2026-09-01';
    p.periods[1].whAmt=10070;
    save();
    return releasedInPeriod(p,1);
  });
  t('⑥ 第1期標記回補後，第2期退還 3,786', n.wh===3786&&n.whFrom.join()==='1');
  const n2=await pg.evaluate(()=>{
    const p=curProj();
    p.periods[0].whAmt=5000;   // 改成直接指定 5,000
    save();
    return releasedInPeriod(p,1);
  });
  t('⑥ ★ 改成直接指定 5,000 後，退還的也變 5,000（不是 3,786）', n2.wh===5000);
  t('⑥ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑦ 只有直接指定、沒設％的專案，扣款追蹤也要出現
{
  const st=seed();
  delete st.projects[0].withholdPct;
  st.projects[0].periods[0].whAmt=3786;
  const {pg,errs}=await open(st);
  const n=await pg.evaluate(()=>{
    const p=curProj();
    return {has:hasWithhold(p),w:withholdOf(p,p.periods[0],calc(p,0).billActual)};
  });
  t('⑦ 沒設％但有指定金額，hasWithhold 仍為 true', n.has===true&&n.w===3786);
  t('⑦ ★ 扣款追蹤表還是出現（暫扣款欄在）',
    await pg.locator('[data-whamt="0"]').count()===1);
  t('⑦ 表頭不寫死百分比', !/暫扣款 3%/.test(await pg.textContent('#app')));
  t('⑦ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
