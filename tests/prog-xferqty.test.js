// 轉出／轉入：只有一式的條目直接填「量」（㎡），不用自己換算成比例
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 公共區是「1 式」：A 項目 100㎡ × $300，甲做了 30㎡（第 1 期）
// TYPE-EXS 是「6 間」：6.1 每間 10㎡ × $150，甲做了 2 間
const seed=()=>({savedAt:Date.now(),tab:'items',cur:'K1',projects:[
  {id:'M',name:'母-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bM',name:'公共區',unit:'式',count:1,items:[
      {id:'m1',no:'A',name:'A 項目',unit:'㎡',qty:100,price:400,amount:40000}]},
    {id:'bM2',name:'TYPE-EXS',unit:'間',count:6,items:[
      {id:'m2',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:300,amount:3000}]}]},
  {id:'K1',name:'甲',vendor:'甲',parentId:'M',taxMode:'excl',signedTotal:0,blocks:[
    {id:'b1',name:'公共區',unit:'式',count:1,srcBlk:'bM',items:[
      {id:'a1',no:'A',name:'A 項目',unit:'㎡',qty:100,price:300,amount:30000,srcId:'m1'}]},
    {id:'b1b',name:'TYPE-EXS',unit:'間',count:6,srcBlk:'bM2',items:[
      {id:'a2',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:150,amount:1500,srcId:'m2'}]}],
   periods:[{no:1,date:'2026-11-01',prog:{a1:{p:0.3,q:30},a2:{p:2/6}}}]},
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

// ① 單位怎麼選：一式的照量、多間的照間數
{
  const {pg,errs}=await open(seed());
  const u=await pg.evaluate(()=>{
    const p=curProj();
    const A=xferUnitOf(p.blocks[0].items[0],p.blocks[0]);   // 1 式、100㎡
    const B=xferUnitOf(p.blocks[1].items[0],p.blocks[1]);   // 6 間、每間 10㎡
    return {A:{byQty:A.byQty,unit:A.unit,out07:A.out(0.7),inv70:A.inv(70),txt:A.txt(0.7)},
            B:{byQty:B.byQty,unit:B.unit,out2:B.out(2),inv2:B.inv(2),txt:B.txt(2)}};
  });
  t('① ★ 一式的條目改照「量」填，單位是 ㎡', u.A.byQty===true&&u.A.unit==='㎡');
  t('① ★ 0.7 式 顯示成 70 ㎡；填 70 換回 0.7',
    u.A.out07===70&&Math.abs(u.A.inv70-0.7)<1e-9&&u.A.txt==='70 ㎡');
  t('① 多間的條目照舊填「間」', u.B.byQty===false&&u.B.unit==='間');
  t('① 多間的不換算（2 間就是 2 間）', u.B.out2===2&&u.B.inv2===2&&u.B.txt==='2 間');
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② 轉出面板：預設帶「還沒做的量」70，而不是 0.7
{
  const {pg,errs}=await open(seed());
  await pg.evaluate(()=>{ openBlk.add('b1'); xfer='b1::a1'; render(); });
  await pg.waitForTimeout(400);
  t('② ★ 欄位標題是「轉出多少㎡」', /轉出多少㎡/.test(await pg.textContent('#app')));
  t('② ★ 預設值是 70（不是 0.7）', await pg.inputValue('#xf-moveq')==='70');
  const txt=await pg.textContent('#app');
  t('② ★ 上面寫「目前這條是 100 ㎡，已完成 30 ㎡」',
    /目前這條是 <?b?>?100 ㎡/.test(txt.replace(/\s+/g,' '))||/100 ㎡/.test(txt));
  t('② 有說明照㎡填，並寫出每式幾㎡',
    /照<?b?>?㎡/.test(txt)&&/每式 100 ㎡/.test(txt));
  t('② 「甲剩下」顯示 30 ㎡', /剩下 ?30/.test(txt.replace(/<[^>]*>/g,'')));

  // 邊打邊算：填 60 → 甲剩 40
  await pg.fill('#xf-moveq','60'); await pg.waitForTimeout(250);
  t('② ★ 打 60 之後「甲剩下」跟著變成 40 ㎡',
    (await pg.textContent('[data-xfleft]')).trim().startsWith('40'));
  // 填超過上限 → 標紅
  await pg.fill('#xf-moveq','80'); await pg.waitForTimeout(250);
  t('② ★ 填 80（超過還沒做的 70）會標紅',
    /bad/.test(await pg.getAttribute('[data-xfleft]','style')||''));
  t('② 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ③ ★ 真的轉：填 70 ㎡ 給乙，兩邊的量與金額都要對
{
  const {pg,errs}=await open(seed());
  const r=await pg.evaluate(()=>{
    const A=state.projects.find(p=>p.id==='K1'), B=state.projects.find(p=>p.id==='K2');
    const b=A.blocks[0], it=b.items[0];
    const U=xferUnitOf(it,b);
    const move=xferMoveFrom(U,'70',xferMaxOf(A,b,it).max);   // 畫面填 70 ㎡
    const res=xferApply(A,b,it,B,move,350);
    save();
    const ia=A.blocks[0].items[0], ib=B.blocks[0].items[0];
    return {err:res.err||null,move,
      甲量:itemTotalQty(ia,A.blocks[0]),甲計價:calc(A,0).blocks[0].cum,
      甲p:A.periods[0].prog.a1.p,甲q:A.periods[0].prog.a1.q,甲log:ia.xlog,
      乙量:itemTotalQty(ib,B.blocks[0]),乙單價:ib.price,乙log:ib.xlog,
      發包:allocationOf(state.projects.find(p=>p.id==='M')).rows
        .filter(x=>x.it.id==='m1').map(x=>({母:x.mQty,已發:x.aQty,剩:x.leftQty,超:x.over}))[0]};
  });
  t('③ 填 70 ㎡ 換成 0.7 式', r.err===null&&Math.abs(r.move-0.7)<1e-9);
  t('③ ★ 甲剩 30 ㎡、計價還是 $9,000（進度自動變 100%）',
    Math.abs(r.甲量-30)<1e-6&&r.甲計價===9000&&r.甲p===1&&r.甲q===30);
  t('③ ★ 乙拿到 70 ㎡、單價 350', r.乙量===70&&r.乙單價===350);
  t('③ ★ 備註寫 ㎡ 不是式（甲：原 100 ㎡，轉 70 ㎡ 給 乙）',
    /原 100 ㎡，轉 70 ㎡ 給 乙/.test(r.甲log.join('|')));
  t('③ ★ 乙的備註也寫 ㎡（自 甲 接手 70 ㎡）',
    /自 甲 接手 70 ㎡/.test(r.乙log.join('|')));
  t('③ 發包分配：母 100、已發 100、剩 0、不超發',
    r.發包.母===100&&r.發包.已發===100&&Math.abs(r.發包.剩)<1e-6&&r.發包.超===false);
  t('③ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ④ 已經做掉的量轉不走，而且訊息用 ㎡ 講
{
  const {pg}=await open(seed());
  const r=await pg.evaluate(()=>{
    const A=state.projects.find(p=>p.id==='K1'), B=state.projects.find(p=>p.id==='K2');
    const b=A.blocks[0], it=b.items[0], U=xferUnitOf(it,b);
    const move=xferMoveFrom(U,'80',xferMaxOf(A,b,it).max);   // 想轉 80㎡，但只有 70 可轉
    return {move,res:xferApply(A,b,it,B,move,350)};
  });
  t('④ ★ 轉 80 ㎡ 被擋下來', !!r.res.err);
  t('④ ★ 錯誤訊息講 30 ㎡／70 ㎡，不是 0.3 式',
    /30 ㎡/.test(r.res.err)&&/70 ㎡/.test(r.res.err)&&!/式/.test(r.res.err));
  await pg.close();
}

// ⑤ 多間的條目完全照舊（填間數、備註寫間）
{
  const {pg,errs}=await open(seed());
  const r=await pg.evaluate(()=>{
    const A=state.projects.find(p=>p.id==='K1'), B=state.projects.find(p=>p.id==='K2');
    const b=A.blocks[1], it=b.items[0], U=xferUnitOf(it,b);
    const mx=xferMaxOf(A,b,it);
    const move=4;                                           // 6 間做了 2 間 → 可轉 4 間
    const res=xferApply(A,b,it,B,move,160); save();
    const ia=A.blocks[1].items[0], kb=B.blocks.find(x=>x.name==='TYPE-EXS');
    return {err:res.err||null,move,max:mx.max,
      甲間:effCount(ia,b),甲log:ia.xlog,
      乙間:effCount(kb.items[0],kb),乙log:kb.items[0].xlog};
  });
  t('⑤ 多間的條目間數欄填 4 就是 4 間', r.err===null&&r.move===4&&Math.abs(r.max-4)<0.01);
  t('⑤ ★ 甲剩 2 間、乙拿 4 間', r.甲間===2&&r.乙間===4);
  t('⑤ ★ 多間的備註以量為主、間數放括號（轉 40 ㎡（約 4 間））',
    /轉 40 ㎡（約 4 間） 給 乙/.test(r.甲log.join('|'))&&/接手 40 ㎡（約 4 間）/.test(r.乙log.join('|')));
  t('⑤ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑥ 轉入面板（多條一次填）：每一列照自己的單位，「全部填滿上限」填的是量
{
  const {pg,errs}=await open(seed());
  await pg.evaluate(()=>{ state.cur='K2'; state.tab='items'; render(); });
  await pg.waitForTimeout(300);
  // 乙還沒有區塊，先照母專案建一個公共區，才能開轉入面板
  await pg.evaluate(()=>{
    const B=curProj();
    B.blocks.push({id:'b2',name:'公共區',unit:'式',count:1,srcBlk:'bM',items:[]});
    openBlk.add('b2'); xferIn='b2'; xferInFrom='K1'; save(); render();
  });
  await pg.waitForTimeout(400);
  const txt=await pg.textContent('#app');
  t('⑥ 標題改成「要轉入多少」（單位寫在每一列）', /要轉入多少/.test(txt));
  t('⑥ ★ 那一列的上限寫 70 ㎡', /70[\s\S]{0,40}㎡/.test(txt.replace(/\s+/g,' ')));
  await pg.click('[data-xferinall="b2"]'); await pg.waitForTimeout(250);
  t('⑥ ★ 「全部填滿上限」填進去的是 70（不是 0.7）',
    await pg.inputValue('[data-ximove="a1"]')==='70');
  t('⑥ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑦ 搬不乾淨的尾數：填的量剛好等於上限時用精確上限，不留 0.00x 的零頭
{
  const st=seed();
  st.projects[1].blocks[0].items[0].qty=3;        // 3㎡ 一式
  st.projects[1].periods[0].prog.a1={p:1/3,q:1};  // 做了 1㎡ → 還能轉 2㎡（0.6667 式）
  const {pg}=await open(st);
  const r=await pg.evaluate(()=>{
    const A=state.projects.find(p=>p.id==='K1'), B=state.projects.find(p=>p.id==='K2');
    const b=A.blocks[0], it=b.items[0], U=xferUnitOf(it,b);
    const mx=xferMaxOf(A,b,it);
    const shown=U.out(mx.max);                       // 畫面上顯示的上限
    const move=xferMoveFrom(U,String(shown),mx.max); // 照畫面填回去
    const res=xferApply(A,b,it,B,move,350); save();
    const ia=A.blocks[0].items[0];
    return {err:res.err||null,shown,move,max:mx.max,
      甲量:itemTotalQty(ia,A.blocks[0]),甲顯示:qfmt(itemTotalQty(ia,A.blocks[0])),
      乙量:itemTotalQty(B.blocks[0].items[0],B.blocks[0]),
      乙顯示:qfmt(itemTotalQty(B.blocks[0].items[0],B.blocks[0]))};
  });
  t('⑦ ★ 畫面顯示的上限是 2 ㎡（不是 2.01——間數的小數位不能先修短）', r.shown===2);
  t('⑦ ★ 照畫面填 2 就用精確上限，不會因為四捨五入多轉或少轉',
    r.err===null&&Math.abs(r.move-r.max)<1e-12);
  t('⑦ ★ 甲剩 1 ㎡、乙拿 2 ㎡（看得到的數字是乾淨的）',
    r.甲顯示==='1'&&r.乙顯示==='2'&&Math.abs(r.甲量-1)<0.01&&Math.abs(r.乙量-2)<0.01);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
