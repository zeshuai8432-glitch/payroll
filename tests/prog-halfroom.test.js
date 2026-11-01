// 「兩間，一間他全做完、一間只做一半」：多間的條目也要能直接照量（㎡）轉
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 雙面隔間：每間 10㎡ × 2 間 ＝ 20㎡，單價 $300/㎡（amount 3,000/間）
// 甲做完 1 間、第 2 間做了 6㎡ → 累計 16㎡（p = 16/20 = 0.8）
// 還沒做的是 4㎡ ＝ 0.4 間
const seed=()=>({savedAt:Date.now(),tab:'items',cur:'K1',projects:[
  {id:'M',name:'母-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bM',name:'TYPE-EXS',unit:'間',count:2,items:[
      {id:'m1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:500,amount:5000}]}]},
  {id:'K1',name:'甲',vendor:'甲',parentId:'M',taxMode:'excl',signedTotal:0,blocks:[
    {id:'b1',name:'TYPE-EXS',unit:'間',count:2,srcBlk:'bM',items:[
      {id:'a1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:300,amount:3000,srcId:'m1'}]}],
   periods:[{id:'p1',no:1,date:'2026-11-01',prog:{a1:{p:0.8,q:16}},settled:4800}]},
  {id:'K2',name:'乙',vendor:'乙',parentId:'M',taxMode:'excl',signedTotal:0,periods:[],blocks:[]}]});

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
const openPanel=async pg=>{
  await pg.evaluate(()=>{ openBlk.add('b1'); xfer='b1::a1'; render(); });
  await pg.waitForTimeout(400);
};

// ① 兩間的條目：間數欄照舊，旁邊多一個「量」的欄位
{
  const {pg,errs}=await open(seed());
  await openPanel(pg);
  t('① 間數欄還在，預設 0.4 間（還沒做的）', await pg.inputValue('#xf-move')==='0.4');
  t('① ★ 旁邊多一個「量」的欄位，預設 4 ㎡', await pg.locator('#xf-moveq').count()===1
    &&await pg.inputValue('#xf-moveq')==='4');
  const txt=await pg.textContent('#app');
  t('① 欄位標題寫「＝ 多少㎡」', /＝ 多少㎡/.test(txt));
  t('① ★ 有提示「一間只做一半的話填右邊的㎡就好」',
    /一間只做一半<\/b>?的話填右邊的「㎡」就好|一間只做一半.{0,20}填右邊/.test(txt.replace(/\s+/g,'')+txt));
  t('① 「甲剩下」兩個單位都寫（1.6 間、16 ㎡）',
    /剩下 ?1\.6/.test(txt.replace(/<[^>]*>/g,''))&&/16/.test(txt));
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② ★ 在「量」欄打字 → 間數欄與「剩下」自己跟著算
{
  const {pg,errs}=await open(seed());
  await openPanel(pg);
  await pg.fill('#xf-moveq','3'); await pg.waitForTimeout(300);
  t('② ★ 填 3 ㎡ → 間數變 0.3', await pg.inputValue('#xf-move')==='0.3');
  t('② ★ 甲剩下 1.7 間', (await pg.textContent('[data-xfleft]')).trim()==='1.7');
  t('② ★ 甲剩下 17 ㎡', (await pg.textContent('[data-xfleftq]')).trim()==='17');

  await pg.fill('#xf-moveq','4'); await pg.waitForTimeout(300);
  t('② 填回 4 ㎡ → 間數 0.4、剩 1.6 間／16 ㎡',
    await pg.inputValue('#xf-move')==='0.4'
    &&(await pg.textContent('[data-xfleft]')).trim()==='1.6'
    &&(await pg.textContent('[data-xfleftq]')).trim()==='16');
  t('② 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ③ 反向連動：在間數欄打字 → 量欄跟著變
{
  const {pg}=await open(seed());
  await openPanel(pg);
  await pg.fill('#xf-move','0.25'); await pg.waitForTimeout(300);
  t('③ ★ 填 0.25 間 → 量欄變 2.5 ㎡', await pg.inputValue('#xf-moveq')==='2.5');
  t('③ 甲剩下 1.75 間／17.5 ㎡',
    (await pg.textContent('[data-xfleft]')).trim()==='1.75'
    &&(await pg.textContent('[data-xfleftq]')).trim()==='17.5');
  await pg.close();
}

// ④ 填超過還沒做的量會標紅（人家做掉的活不能轉走）
{
  const {pg}=await open(seed());
  await openPanel(pg);
  await pg.fill('#xf-moveq','8'); await pg.waitForTimeout(300);
  t('④ ★ 填 8 ㎡（只剩 4 ㎡ 沒做）標紅',
    /bad/.test(await pg.getAttribute('[data-xfleft]','style')||''));
  await pg.close();
}

// ⑤ ★ 真的轉：4 ㎡ 收回自辦（走畫面的真實流程），甲的錢一毛不動
{
  const {pg,errs}=await open(seed());
  await openPanel(pg);
  const before=await pg.evaluate(()=>{ const A=curProj(); const c=calc(A,0);
    return {計價:c.blocks[0].cum,實請:c.billActual}; });
  await pg.fill('#xf-moveq','4'); await pg.waitForTimeout(300);
  await pg.selectOption('#xf-to','__self__');
  await pg.click('[data-xferok="b1::a1"]'); await pg.waitForTimeout(500);
  const r=await pg.evaluate(()=>{
    const A=state.projects.find(p=>p.id==='K1'), M=state.projects.find(p=>p.id==='M');
    const b=A.blocks[0], it=b.items[0], c=calc(A,0);
    return {甲間:effCount(it,b),甲量:itemTotalQty(it,b),
      計價:c.blocks[0].cum,實請:c.billActual,
      p:A.periods[0].prog.a1.p,q:A.periods[0].prog.a1.q,
      自辦:M.blocks[0].items[0].selfQty,log:it.xlog};
  });
  t('⑤ ★ 甲剩 1.6 間＝16 ㎡（剛好是他做完的）', r.甲間===1.6&&Math.abs(r.甲量-16)<1e-9);
  t('⑤ ★ 甲的累計完成計價一毛沒動', r.計價===before.計價&&r.計價===4800);
  t('⑤ ★ 已結算的請款金額也沒動', r.實請===before.實請&&r.實請===4800);
  t('⑤ ★ 進度自動變 100%（做掉的 16 ㎡ 是既成事實）', r.p===1&&r.q===16);
  t('⑤ ★ 母專案那條自辦量 +4 ㎡', Math.abs(r.自辦-4)<1e-9);
  t('⑤ 備註留痕', /轉 0\.4 間 給 自辦/.test((r.log||[]).join('|')));
  t('⑤ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑥ 轉給另一家：發包分配要剛好對上，不超發
{
  const {pg,errs}=await open(seed());
  const r=await pg.evaluate(()=>{
    const A=state.projects.find(p=>p.id==='K1'), B=state.projects.find(p=>p.id==='K2');
    const b=A.blocks[0], it=b.items[0];
    const res=xferApply(A,b,it,B,xferRoomsFromQty(it,4),350); save();
    const ia=A.blocks[0].items[0], kb=B.blocks[0];
    const al=allocationOf(state.projects.find(p=>p.id==='M'));
    return {err:res.err||null,
      甲量:itemTotalQty(ia,b),乙量:itemTotalQty(kb.items[0],kb),
      甲log:ia.xlog,乙log:kb.items[0].xlog,
      發包:al.rows.filter(x=>x.it.id==='m1').map(x=>({母:x.mQty,已發:x.aQty,剩:x.leftQty,超:x.over}))[0]};
  });
  t('⑥ 轉成功', r.err===null);
  t('⑥ ★ 甲 16 ㎡、乙 4 ㎡', Math.abs(r.甲量-16)<1e-9&&Math.abs(r.乙量-4)<1e-9);
  t('⑥ 備註照「間」寫（這條是多間的條目）',
    /轉 0\.4 間 給 乙/.test(r.甲log.join('|'))&&/接手 0\.4 間/.test(r.乙log.join('|')));
  t('⑥ ★ 發包分配：母 20 ㎡、已發 20 ㎡、剩 0、不超發',
    r.發包.母===20&&Math.abs(r.發包.已發-20)<0.01&&Math.abs(r.發包.剩)<0.01&&r.發包.超===false);
  t('⑥ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑦ 一式的條目不要多出那個欄位（#188 的行為不變）
{
  const st=seed();
  st.projects[1].blocks[0].count=1;
  st.projects[1].blocks[0].unit='式';
  st.projects[1].blocks[0].items[0].qty=100;
  st.projects[1].periods[0].prog.a1={p:0.3,q:30};
  const {pg,errs}=await open(st);
  await openPanel(pg);
  t('⑦ 一式的條目只有一個欄位，單位就是 ㎡',
    await pg.locator('#xf-moveq').count()===0
    &&await pg.inputValue('#xf-move')==='70');
  t('⑦ 還是有「式數拆不動」的說明', /式數拆不動/.test(await pg.textContent('#app')));
  t('⑦ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑧ 轉入表格：多間的列把兩個單位都寫出來
{
  const {pg,errs}=await open(seed());
  await pg.evaluate(()=>{
    state.cur='K2'; state.tab='items';
    const B=curProj();
    B.blocks.push({id:'b2',name:'TYPE-EXS',unit:'間',count:2,srcBlk:'bM',items:[]});
    openBlk.add('b2'); xferIn='b2'; xferInFrom='K1'; save(); render();
  });
  await pg.waitForTimeout(400);
  const txt=(await pg.textContent('#app')).replace(/\s+/g,' ');
  t('⑧ ★ 最多可轉兩個單位都寫（0.4 間＝4 ㎡）', /0\.4 間ã?＝ ?4 ㎡/.test(txt)||/0\.4 間＝ 4 ㎡/.test(txt));
  t('⑧ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
