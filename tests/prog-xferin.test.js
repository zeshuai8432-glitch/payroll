// ↙ 從別家轉入：站在接手方把量抓過來。必須是「搬量」不是複製，而且不能搬走對方做掉的量
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// A 母（代工）→ 東澤（自己，全量 6 間）＋ C（阿華，還沒拿到東西）
const seed=()=>({savedAt:Date.now(),tab:'items',cur:'C',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bA',name:'TYPE-EXS',unit:'間',count:6,items:[
      {id:'m1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:300,amount:3000},
      {id:'m2',no:'6.9',name:'壁龕',unit:'㎡',qty:2.5,price:280,amount:700},
      {id:'m3',no:'6.20',name:'走道天花',unit:'㎡',qty:8,price:260,amount:2080}]}]},
  {id:'T',name:'凱子-代工-東澤',vendor:'東澤',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bT',name:'TYPE-EXS',unit:'間',count:6,srcBlk:'bA',items:[
      {id:'t1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:300,amount:3000,srcId:'m1',printAs:'雙面隔間'},
      {id:'t2',no:'6.9',name:'壁龕',unit:'㎡',qty:2.5,price:280,amount:700,srcId:'m2'},
      {id:'t3',no:'6.20',name:'走道天花',unit:'㎡',qty:8,price:260,amount:2080,srcId:'m3'}]}]},
  {id:'C',name:'凱子-代工-阿華',vendor:'阿華',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[]}]});

(async()=>{
const br=await chromium.launch();
const open=async st=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(800);
  pg.on('dialog',async d=>{ await d.accept(); });
  return {pg,errs};
};
// 母專案總發包金額（所有子專案加總）——搬量前後必須一樣
const alloc=pg=>pg.evaluate(()=>{
  const A=state.projects.find(p=>p.id==='A');
  const ba=blockAllocationOf(A);
  return {tot:ba.totAlloc,mother:ba.totMother,over:ba.over};
});

// ① C 還沒有任何區塊 → 要能從東澤轉入，並自動建出對應區塊
{
  const {pg,errs}=await open(seed());
  const before=await alloc(pg);
  t('① 搬之前：已發包 '+before.tot+'（＝東澤全量）', Math.abs(before.tot-6*(3000+700+2080))<0.5);

  // C 沒有區塊 → 先從母專案補一個？不行，所以轉入按鈕要掛在區塊上。
  // 實務上 C 會先有區塊；這裡直接驗 xferApply 會自動建區塊
  const r=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    const sb=T.blocks[0], it=sb.items.find(x=>x.id==='t1');
    const res=xferApply(T,sb,it,C,2,280);
    save();
    return {err:res.err||'',blk:C.blocks.length,nm:C.blocks[0]&&C.blocks[0].name,
            srcBlk:C.blocks[0]&&C.blocks[0].srcBlk,
            it:C.blocks[0]&&C.blocks[0].items[0],
            tcnt:effCount(sb.items.find(x=>x.id==='t1'),sb)};
  });
  t('① 沒有錯誤', !r.err);
  t('① 自動建出對應區塊，而且記著對應哪個母區塊', r.blk===1&&r.nm==='TYPE-EXS'&&r.srcBlk==='bA');
  t('① 接手方拿到 2 間、單價照填的 280', r.it.cnt===2&&r.it.price===280);
  t('① 溯源跟著走（發包分配對得回母專案）', r.it.srcId==='m1');
  t('① 列印合併名稱也跟著走', r.it.printAs==='雙面隔間');
  t('① 留痕在 xlog，不在備註', /自 東澤 接手 2 間/.test((r.it.xlog||[]).join('；'))&&!/接手/.test(r.it.remark||''));
  t('① 來源同步減成 4 間（是搬量不是複製）', r.tcnt===4);
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② 面板操作：一次轉入多條
{
  const st=seed();
  st.projects[2].blocks=[{id:'bC',name:'TYPE-EXS',unit:'間',count:0,srcBlk:'bA',items:[]}];
  const {pg,errs}=await open(st);
  await pg.evaluate(()=>{ openBlk.add('bC'); render(); }); await pg.waitForTimeout(300);
  t('② 子專案才有轉入按鈕', await pg.locator('[data-xferin="bC"]').count()===1);
  await pg.click('[data-xferin="bC"]'); await pg.waitForTimeout(350);
  const p=await pg.textContent('.card[style*="56,189,248"]');
  t('② 來源預設是東澤', /東澤/.test(p));
  t('② 講明是搬量不是複製', /搬量不是複製/.test(p));
  t('② 三條都列出來', await pg.locator('[data-ximove]').count()===3);
  t('② 顯示最多可轉 6 間', /最多可轉/.test(p));

  // 只轉兩條：雙面隔間 2 間、壁龕 6 間（整條轉光）
  await pg.fill('[data-ximove="t1"]','2');
  await pg.fill('[data-ximove="t2"]','6');
  await pg.click('[data-xferinok="bC"]'); await pg.waitForTimeout(700);

  const r=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    const sb=T.blocks[0], cb=C.blocks[0];
    return {
      tIds:sb.items.map(x=>x.id),
      t1:effCount(sb.items.find(x=>x.id==='t1'),sb),
      t3:effCount(sb.items.find(x=>x.id==='t3'),sb),
      cItems:cb.items.map(x=>({nm:x.name,cnt:x.cnt,src:x.srcId})),
      trash:(T.trash||[]).length};
  });
  t('③ 只搬了勾的兩條，走道天花沒動（6 間）', r.t3===6);
  t('③ 雙面隔間：東澤剩 4', r.t1===4);
  t('③ 壁龕整條轉光 → 從東澤移除', !r.tIds.includes('t2'));
  t('③ 而且丟進東澤的回收桶（按錯救得回來）', r.trash===1);
  t('③ 阿華拿到兩條', r.cItems.length===2);
  t('③ 間數正確（2 ／ 6）', r.cItems[0].cnt===2&&r.cItems[1].cnt===6);

  // 最關鍵：母專案的發包總額不能變（搬量守恆）
  const after=await alloc(pg);
  t('④ 母專案「已發包」總額不變（搬量守恆，實際 '+after.tot+'）',
    Math.abs(after.tot-6*(3000+700+2080))<0.5);
  t('④ 沒有任何房型超額', after.over===0);
  t('④ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑤ 對方已經做掉的量不能被搬走
{
  const st=seed();
  // 東澤最新一期：雙面隔間已完成 5 間（每間 10 ㎡ → 50）
  st.projects[1].periods=[{id:'p1',no:1,date:'2026-09-30',prog:{t1:{p:5/6,q:50}}}];
  st.projects[1].curPeriod=0;
  st.projects[2].blocks=[{id:'bC',name:'TYPE-EXS',unit:'間',count:0,srcBlk:'bA',items:[]}];
  const {pg}=await open(st);
  await pg.evaluate(()=>{ openBlk.add('bC'); render(); }); await pg.waitForTimeout(300);
  await pg.click('[data-xferin="bC"]'); await pg.waitForTimeout(350);
  const p=await pg.textContent('.card[style*="56,189,248"]');
  t('⑤ 面板上就顯示對方已做 5 間', /\b5\b/.test(p));
  const mx=await pg.getAttribute('[data-ximove="t1"]','data-ximax');
  t('⑤ 最多可轉只剩 1 間（6 − 已做 5）：'+mx, Math.abs(Number(mx)-1)<0.001);

  // 試著轉 3 間 → 必須被擋，而且什麼都不能動
  let msg='';
  pg.removeAllListeners('dialog');
  pg.on('dialog',async d=>{ msg=d.message(); await d.dismiss(); });
  await pg.fill('[data-ximove="t1"]','3');
  await pg.click('[data-xferinok="bC"]'); await pg.waitForTimeout(500);
  t('⑥ 擋下來並說清楚上限：'+msg.slice(0,34).replace(/\n/g,' '), /最多只能轉 1 間/.test(msg));
  const r=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    return {t1:effCount(T.blocks[0].items.find(x=>x.id==='t1'),T.blocks[0]),
            c:C.blocks[0].items.length};
  });
  t('⑥ 被擋時一條都沒搬（不會搬一半）', r.t1===6&&r.c===0);

  // 「全部填滿上限」只會填到合法上限
  pg.removeAllListeners('dialog');
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.click('[data-xferinall="bC"]'); await pg.waitForTimeout(200);
  t('⑦ 全部填滿上限：雙面隔間填 1，不是 6', await pg.inputValue('[data-ximove="t1"]')==='1');
  await pg.click('[data-xferinok="bC"]'); await pg.waitForTimeout(700);
  const r2=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T');
    const it=T.blocks[0].items.find(x=>x.id==='t1');
    const per=T.periods[0];
    return {cnt:effCount(it,T.blocks[0]),q:per.prog.t1.q,p:+per.prog.t1.p.toFixed(4)};
  });
  t('⑦ 東澤剩 5 間（已做的那 5 間留著）', r2.cnt===5);
  t('⑦ 已完成的絕對量沒被改（50 ㎡），百分比改成 100%', r2.q===50&&Math.abs(r2.p-1)<0.001);
  await pg.close();
}

// ⑧ 轉兩次：間數累加，備註也必須跟著記（原本永遠停在第一次的量）
{
  const st=seed();
  st.projects[2].blocks=[{id:'bC',name:'TYPE-EXS',unit:'間',count:0,srcBlk:'bA',items:[]}];
  const {pg}=await open(st);
  const twice=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    const sb=T.blocks[0];
    xferApply(T,sb,sb.items.find(x=>x.id==='t1'),C,3,140);   // 先轉 3 間
    xferApply(T,sb,sb.items.find(x=>x.id==='t1'),C,6-3,140); // 再轉 3 間（共 6）
    save();
    const it=C.blocks[0].items[0];
    return {cnt:effCount(it,C.blocks[0]),rk:(it.xlog||[]).join('；'),n:C.blocks[0].items.length,
            printed:it.remark||''};
  });
  t('⑧ 累加成一條，不會變成兩條', twice.n===1);
  t('⑧ 間數累加正確（6）', twice.cnt===6);
  t('⑧ xlog 記了第一次', /自 東澤 接手 3 間/.test(twice.rk));
  t('⑧ 也記了第二次與累計總數：'+twice.rk.split('；').pop(),
    /再接手 3 間（原 3，共 6 間）/.test(twice.rk));
  t('⑧ 備註完全乾淨（所以列印也看不到）', twice.printed==='');
  await pg.close();
}

// ⑨ 剛建好、每個區塊都空的子專案：不能整頁空白（轉入入口長在區塊上）
{
  const st=seed();
  st.projects[2].blocks=[
    {id:'bC',name:'TYPE-EXS',unit:'間',count:0,srcBlk:'bA',items:[]},
    {id:'bC2',name:'TYPE-L',unit:'間',count:0,items:[]}];
  const {pg}=await open(st);
  await pg.waitForTimeout(300);
  t('⑨ 空區塊照樣顯示出來', await pg.locator('details.blk').count()===2);
  t('⑨ 轉入按鈕碰得到', await pg.locator('[data-xferin]').count()>=1);
  // 有細項之後才恢復隱藏（子專案預設開啟）
  const hid=await pg.evaluate(()=>{
    const C=state.projects.find(p=>p.id==='C');
    C.blocks[0].items.push({id:'x1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:140,amount:1400,srcId:'m1'});
    save(); render();
    return {hide:hideEmptyOf(C),blks:document.querySelectorAll('details.blk').length};
  });
  t('⑨ 有細項之後恢復隱藏空區塊（只剩 1 個）', hid.hide===true&&hid.blks===1);
  await pg.close();
}

// ⑩ ★ 同一條母細項拆出來的工序共用 srcId，轉過去不能被併成一條
{
  const st={savedAt:Date.now(),tab:'items',cur:'C',projects:[
    {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
      {id:'bA',name:'TYPE-EXS',unit:'間',count:9,items:[
        {id:'m1',no:'5.3',name:'床頭/電視牆/玄關單面隔間',unit:'㎡',qty:43.72,price:300,amount:13116}]}]},
    // 東澤把母的那一條拆成兩道工序 —— 兩道的 srcId 都是 m1
    {id:'T',name:'凱子-代工-東澤',vendor:'東澤',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
      {id:'bT',name:'TYPE-EXS',unit:'間',count:9,srcBlk:'bA',items:[
        {id:'t1',no:'5.3',name:'床頭/電視牆/玄關單面隔間-骨架',unit:'㎡',qty:43.72,price:140,amount:6120.8,
         srcId:'m1',groupId:'g1',groupName:'床頭/電視牆/玄關單面隔間'},
        {id:'t2',no:'5.3',name:'床頭/電視牆/玄關單面隔間-封板',unit:'㎡',qty:43.72,price:120,amount:5246.4,
         srcId:'m1',groupId:'g1',groupName:'床頭/電視牆/玄關單面隔間'}]}]},
    {id:'C',name:'凱子-代工-阿華',vendor:'阿華',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
      {id:'bC',name:'TYPE-EXS',unit:'間',count:0,srcBlk:'bA',items:[]}]}]};
  const {pg}=await open(st);
  const r=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    const sb=T.blocks[0];
    xferApply(T,sb,sb.items.find(x=>x.id==='t1'),C,6,140);   // 骨架 6 間
    xferApply(T,sb,sb.items.find(x=>x.id==='t2'),C,3,120);   // 封板 3 間
    save();
    const cb=C.blocks[0];
    return {n:cb.items.length,
      items:cb.items.map(x=>({nm:x.name,cnt:effCount(x,cb),p:x.price,src:x.srcId,gn:x.groupName||''})),
      tOf:sb.items.map(x=>({nm:x.name,cnt:effCount(x,sb)}))};
  });
  t('⑩ ★ 骨架與封板是兩條，沒有被併成一條（實際 '+r.n+' 條）', r.n===2);
  t('⑩ ★ 骨架 6 間，不是 9', r.items[0].cnt===6&&/骨架$/.test(r.items[0].nm));
  t('⑩ ★ 封板 3 間，沒有消失', r.items[1].cnt===3&&/封板$/.test(r.items[1].nm));
  t('⑩ 兩條單價各自保留（140／120）', r.items[0].p===140&&r.items[1].p===120);
  t('⑩ 兩條都還指著同一條母細項（發包分配照樣對得回去）',
    r.items[0].src==='m1'&&r.items[1].src==='m1');
  t('⑩ 接手方也收成同一個工序群組', r.items[0].gn===r.items[1].gn&&r.items[0].gn!=='');
  t('⑩ 東澤那邊各自減對：骨架 3、封板 6',
    r.tOf[0].cnt===3&&r.tOf[1].cnt===6);

  // 同一道工序再轉一次，這次才該累加
  const r2=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    const sb=T.blocks[0];
    xferApply(T,sb,sb.items.find(x=>x.id==='t1'),C,2,140);   // 骨架再 2 間
    save();
    const cb=C.blocks[0];
    return {n:cb.items.length,items:cb.items.map(x=>({nm:x.name,cnt:effCount(x,cb)}))};
  });
  t('⑪ 同一道工序再轉才累加（骨架 6＋2＝8，仍然 2 條）',
    r2.n===2&&r2.items[0].cnt===8&&r2.items[1].cnt===3);
  await pg.close();
}

// ⑫ 轉出入紀錄不進備註、不進列印
{
  const st=seed();
  st.projects[1].blocks[0].items[0].remark='圖面編號D1/F1';
  st.projects[2].blocks=[{id:'bC',name:'TYPE-EXS',unit:'間',count:0,srcBlk:'bA',items:[]}];
  const {pg}=await open(st);
  const r=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    const sb=T.blocks[0];
    xferApply(T,sb,sb.items.find(x=>x.id==='t1'),C,2,140);
    xferApply(T,sb,sb.items.find(x=>x.id==='t1'),C,1,140);
    save();
    const src=T.blocks[0].items.find(x=>x.id==='t1'), dst=C.blocks[0].items[0];
    return {srcRk:src.remark||'',srcLog:src.xlog||[],dstRk:dst.remark||'',dstLog:dst.xlog||[]};
  });
  t('⑫ 來源備註只剩自己寫的（圖面編號）：'+r.srcRk, r.srcRk==='圖面編號D1/F1');
  t('⑫ 轉出紀錄存在 xlog（2 筆）', r.srcLog.length===2&&/轉 2 間 給 阿華/.test(r.srcLog[0]));
  t('⑫ 接手方備註帶自己寫的、不帶系統紀錄', r.dstRk==='圖面編號D1/F1'&&!/接手/.test(r.dstRk));
  t('⑫ 接手方 xlog 有建立與累加兩筆', r.dstLog.length===2&&/再接手 1 間（原 2，共 3 間）/.test(r.dstLog[1]));

  // 畫面上：備註欄沒有系統文字，名稱旁有 ⇄ 小標籤
  await pg.evaluate(()=>{ state.cur='T'; state.tab='items'; openBlk.add('bT'); render(); });
  await pg.waitForTimeout(350);
  const row=await pg.evaluate(()=>{const tr=document.getElementById('row-t1');return tr?tr.innerText.replace(/\s+/g,' '):'';});
  t('⑬ 備註欄看不到轉出紀錄', !/轉 2 間 給/.test(row)&&!/原 6 間/.test(row));
  t('⑬ 名稱旁有 ⇄ 標籤（滑過去看得到紀錄）', /⇄ 2/.test(row));
  await pg.close();
}

// ⑭ 舊資料自己好：備註裡的系統紀錄搬進 xlog
{
  const st=seed();
  st.projects[1].blocks[0].items[0].remark='圖面編號D/F；2026-10-01 原 40 間，轉 6 間 給 鑫；2026-10-01 自 東澤 接手 3 間';
  const {pg}=await open(st);
  const r=await pg.evaluate(()=>{
    const it=state.projects.find(p=>p.id==='T').blocks[0].items[0];
    return {rk:it.remark||'',log:it.xlog||[]};
  });
  t('⑭ 自己寫的留在備註：'+r.rk, r.rk==='圖面編號D/F');
  t('⑭ 兩筆系統紀錄搬進 xlog', r.log.length===2
    &&/轉 6 間 給 鑫/.test(r.log[0])&&/自 東澤 接手 3 間/.test(r.log[1]));
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
