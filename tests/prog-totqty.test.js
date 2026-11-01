// 數量一律改「總量」：轉出過的條目間數會變成 1.59 這種比例，
// 把總量當成單間數量去改，量就整個錯掉（他真的踩過）
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 2 間 × 每間 73.2㎡ ＝ 146.4㎡。轉走 30㎡ 之後 cnt＝1.5901…，總量 116.4㎡
const seed=(cnt,qty)=>({savedAt:Date.now(),tab:'items',cur:'K1',projects:[
  {id:'M',name:'母',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bM',name:'TYPE-A',unit:'間',count:2,items:[
      {id:'m1',no:'6.1',name:'封板',unit:'㎡',qty:73.2,price:280,amount:20496}]}]},
  {id:'K1',name:'東澤',vendor:'東澤',parentId:'M',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'b1',name:'TYPE-A',unit:'間',count:2,srcBlk:'bM',items:[
      Object.assign({id:'a1',no:'6.1',name:'封板',unit:'㎡',qty,price:140,amount:qty*140,srcId:'m1'},
        cnt===null?{}:{cnt})]}]}]});

(async()=>{
const br=await chromium.launch();
const open=async st=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.evaluate(()=>{ openBlk.add('b1'); itemEdit='b1::a1'; render(); });
  await pg.waitForTimeout(400);
  return {pg,errs};
};
const totalOf=pg=>pg.evaluate(()=>{
  const p=curProj(), b=p.blocks[0], it=b.items[0];
  return {tot:itemTotalQty(it,b),qty:it.qty,cnt:it.cnt,value:itemValue(it,b)};
});

// ① 轉出過的條目（cnt 是比例）：編輯表單以「總數量」為主，而且標出來
{
  const {pg,errs}=await open(seed(116.4/73.2,73.2));
  t('① ★ 有「總數量」欄位，值是整條總量 116.4', await pg.locator('#if-qtytot').count()===1
    &&await pg.inputValue('#if-qtytot')==='116.4');
  const txt=await pg.textContent('#app');
  t('① ★ 標出「這條轉出過，請改這裡」', /總數量（這條轉出過，請改這裡）/.test(txt));
  t('① 每間數量當輔助欄，標明乘幾間', /每間數量 ×1\.59/.test(txt)
    &&await pg.inputValue('#if-qty')==='73.2');
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② ★ 他踩的那個坑：改總量 116.4 → 100，總量要真的變 100（不是 100×1.59）
{
  const {pg,errs}=await open(seed(116.4/73.2,73.2));
  await pg.fill('#if-qtytot','100');
  await pg.click('[data-itemok="b1::a1"]'); await pg.waitForTimeout(500);
  const r=await totalOf(pg);
  t('② ★ 總量真的是 100（不是 159.02）', Math.abs(r.tot-100)<0.01);
  t('② 單間數量自動回推成 62.9（100 ÷ 1.5901）', Math.abs(r.qty-100/(116.4/73.2))<0.01);
  t('② 間數沒被動到（還是 1.5901）', Math.abs(r.cnt-116.4/73.2)<1e-9);
  t('② 金額跟著總量算（100 × 140 ＝ 14,000）', Math.abs(r.value-14000)<1);
  t('② 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ③ 兩欄連動：打總量另一欄跟著算，打每間也一樣
{
  const {pg}=await open(seed(116.4/73.2,73.2));
  await pg.fill('#if-qtytot','159.02'); await pg.waitForTimeout(250);
  t('③ ★ 打總量 159.02 → 每間變 100', await pg.inputValue('#if-qty')==='100');
  await pg.fill('#if-qty','50'); await pg.waitForTimeout(250);
  t('③ ★ 打每間 50 → 總量變 79.51', await pg.inputValue('#if-qtytot')==='79.51');
  await pg.click('[data-itemok="b1::a1"]'); await pg.waitForTimeout(500);
  const r=await totalOf(pg);
  t('③ 存檔以總量為準（79.51）', Math.abs(r.tot-79.51)<0.02&&Math.abs(r.qty-50)<0.01);
  await pg.close();
}

// ④ 一般的多間條目（整數間）也一樣以總量為主
{
  const {pg}=await open(seed(null,73.2));   // 沒有 cnt → 照區塊 2 間
  t('④ 總量是 146.4（73.2 × 2 間）', await pg.inputValue('#if-qtytot')==='146.4');
  t('④ 沒有「轉出過」的警告字樣', !/這條轉出過/.test(await pg.textContent('#app')));
  await pg.fill('#if-qtytot','200');
  await pg.click('[data-itemok="b1::a1"]'); await pg.waitForTimeout(500);
  const r=await totalOf(pg);
  t('④ ★ 改總量 200 → 每間 100、總量 200', Math.abs(r.tot-200)<0.01&&Math.abs(r.qty-100)<0.01);
  await pg.close();
}

// ⑤ 只有 1 間的條目：沒有輔助欄，算式留得住
{
  const st=seed(1,100);
  st.projects[1].blocks[0].count=1;
  st.projects[1].blocks[0].unit='式';
  const {pg}=await open(st);
  t('⑤ 1 間的條目不顯示「每間數量」輔助欄',
    await pg.evaluate(()=>{const e=document.getElementById('if-qty');return !e||e.type==='hidden';}));
  await pg.fill('#if-qtytot','5.11*3.07');
  await pg.click('[data-itemok="b1::a1"]'); await pg.waitForTimeout(500);
  const r=await pg.evaluate(()=>{const it=curProj().blocks[0].items[0];
    return {qty:it.qty,expr:it.qtyExpr||''};});
  t('⑤ ★ 算式算得對（5.11×3.07 ＝ 15.69）', Math.abs(r.qty-15.6877)<0.001);
  t('⑤ ★ 算式本身也留著（1 間時才留得住）', r.expr==='5.11*3.07');
  await pg.close();
}

// ⑥ 已登錄進度時，改總量不會動到已結算的錢
{
  const st=seed(116.4/73.2,73.2);
  st.projects[1].periods=[{id:'p1',no:1,date:'2026-11-01',prog:{a1:{p:0.5,q:58.2}},settled:8148}];
  const {pg,errs}=await open(st);
  // 「數量改了要照哪一種算？」→ 取消＝完成的「量」不變（改施作範圍）
  pg.removeAllListeners('dialog');
  pg.on('dialog',async d=>{ if(/照哪一種算/.test(d.message())) await d.dismiss(); else await d.accept(); });
  await pg.fill('#if-qtytot','100');
  await pg.click('[data-itemok="b1::a1"]'); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>{
    const p=curProj(), b=p.blocks[0], it=b.items[0], c=calc(p,0);
    return {tot:itemTotalQty(it,b),q:p.periods[0].prog.a1.q,
      p:p.periods[0].prog.a1.p,實請:c.billActual};
  });
  t('⑥ 總量改成 100', Math.abs(r.tot-100)<0.01);
  t('⑥ ★ 已做的絕對量 58.2 原封不動', Math.abs(r.q-58.2)<0.01);
  t('⑥ ★ 完成％照新總量回推（58.2／100 ＝ 58.2%）', Math.abs(r.p-0.582)<0.001);
  t('⑥ ★ 已結算鎖定的金額一毛沒動', r.實請===8148);
  t('⑥ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑦ 整批改那一欄也是總量
{
  const {pg,errs}=await open(seed(116.4/73.2,73.2));
  await pg.evaluate(()=>{ itemEdit=null; batchEdit='b1'; render(); });
  await pg.waitForTimeout(400);
  t('⑦ 整批改的數量欄顯示總量 116.4',
    await pg.inputValue('#be-qty-a1')==='116.4');
  await pg.fill('#be-qty-a1','120');
  await pg.click('[data-batchok="b1"]'); await pg.waitForTimeout(600);
  const r=await totalOf(pg);
  t('⑦ ★ 整批改填 120 → 總量真的是 120', Math.abs(r.tot-120)<0.01);
  t('⑦ 間數沒被動到', Math.abs(r.cnt-116.4/73.2)<1e-9);
  t('⑦ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
