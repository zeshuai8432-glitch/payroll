// 同名但不同條的合約項目，不可以被併成同一個工序群組
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 母專案兩條都叫「雙面隔間」，只差圖面編號；各自拆成 3 道工序
const mk=()=>{
  const mItems=[];
  // 兩條不同的合約項目＝不同項次（同一個房型不會有兩條同項次），只差圖面編號
  ['D/F','C'].forEach((plan,i)=>['骨架','封板','二次封板'].forEach(st=>{
    mItems.push({id:`m${i}${st}`,no:i===0?'6.3':'6.4',name:`雙面隔間-${st}`,unit:'㎡',qty:9.15,price:300,
      amount:2745,remark:`圖面編號${plan}`,groupId:`mg${i}`,groupName:'雙面隔間'});
  }));
  return {savedAt:Date.now(),tab:'items',cur:'T',projects:[
    {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
      {id:'bA',name:'TYPE-EXS',unit:'間',count:40,items:mItems}]},
    {id:'T',name:'凱子-代工-東澤',vendor:'東澤',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
      {id:'bT',name:'TYPE-EXS',unit:'間',count:40,srcBlk:'bA',items:mItems.map(m=>({
        id:'t'+m.id,no:m.no,name:m.name,unit:m.unit,qty:m.qty,price:140,amount:1281,
        remark:m.remark,srcId:m.id,groupId:m.groupId,groupName:m.groupName}))}]},
    {id:'C',name:'凱子-代工-鑫',vendor:'鑫',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
      {id:'bC',name:'TYPE-EXS',unit:'間',count:40,srcBlk:'bA',items:[]}]}]};
};

(async()=>{
const br=await chromium.launch();
const open=async(st,cur)=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(800);
  pg.on('dialog',async d=>{ await d.accept(); });
  if(cur) await pg.evaluate(c=>{state.cur=c;render();},cur);
  return {pg,errs};
};

// ① 轉出／轉入六道工序過去 → 必須是兩組三道，不是一組六道
{
  const {pg,errs}=await open(mk(),'C');
  const r=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    const sb=T.blocks[0];
    sb.items.slice().forEach(it=>xferApply(T,sb,it,C,6,140));
    save();
    const cb=C.blocks[0];
    const by={}; cb.items.forEach(x=>(by[x.groupId]=by[x.groupId]||[]).push(x.name+'|'+(x.remark||'')));
    return {n:cb.items.length,groups:Object.keys(by).length,sets:Object.values(by)};
  });
  t('① 六道都轉過去了', r.n===6);
  t('① ★ 分成兩組，不是混成一組（實際 '+r.groups+' 組）', r.groups===2);
  t('① 每組三道', r.sets.every(x=>x.length===3));
  t('① 同一組裡圖面編號一致（沒有 D/F 和 C 混在一起）',
    r.sets.every(x=>new Set(x.map(y=>y.split('|')[1])).size===1));
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② 從母專案補細項也要分開
{
  const {pg}=await open(mk(),'C');
  await pg.evaluate(()=>{ openBlk.add('bC'); render(); }); await pg.waitForTimeout(300);
  await pg.click('[data-backfill="bC"]'); await pg.waitForTimeout(350);
  await pg.evaluate(()=>{ document.querySelectorAll('[data-bfpick]').forEach(c=>c.checked=true); });
  await pg.click('[data-backfillok="bC"]'); await pg.waitForTimeout(700);
  const r=await pg.evaluate(()=>{
    const cb=state.projects.find(p=>p.id==='C').blocks[0];
    const by={}; cb.items.forEach(x=>(by[x.groupId]=by[x.groupId]||[]).push(x.remark||''));
    return {n:cb.items.length,groups:Object.keys(by).length,
            pure:Object.values(by).every(x=>new Set(x).size===1)};
  });
  t('② 補進六條', r.n===6);
  t('② ★ 分成兩組', r.groups===2);
  t('② 同組圖面編號一致', r.pure);
  await pg.close();
}

// ③ 舊資料（已經混在一起的）要被偵測出來，並能一鍵分開
{
  const st=mk();
  // 模擬 bug 造成的結果：六道全部掛同一個 groupId，其中一道量還不一樣
  st.projects[2].blocks[0].items=st.projects[1].blocks[0].items.map((x,i)=>({
    ...x,id:'c'+i,groupId:'BAD',cnt:(i===5?3:6)}));
  const {pg,errs}=await open(st,'C');
  await pg.waitForTimeout(300);
  const found=await pg.evaluate(()=>{const m=mixedGroupsOf(curProj());
    return {n:m.length,items:m[0]?m[0].items.length:0,keys:m[0]?m[0].keys.length:0};});
  t('③ 偵測到 1 組混在一起（6 道、項次 6.3 與 6.4）',
    found.n===1&&found.items===6&&found.keys===2);
  t('③ 畫面上有紅字警告', /混了不同的合約項目/.test(await pg.textContent('#app')));
  t('③ 有一鍵修復按鈕', await pg.locator('#fix-mixedg').count()===1);

  const before=await pg.evaluate(()=>{const cb=curProj().blocks[0];
    return {amt:cb.items.reduce((a,x)=>a+itemValue(x,cb),0),n:cb.items.length,
            cnts:cb.items.map(x=>effCount(x,cb))};});
  await pg.click('#fix-mixedg'); await pg.waitForTimeout(700);
  const after=await pg.evaluate(()=>{const cb=curProj().blocks[0];
    const by={}; cb.items.forEach(x=>(by[x.groupId]=by[x.groupId]||[]).push(x.remark||''));
    return {groups:Object.keys(by).length,pure:Object.values(by).every(x=>new Set(x).size===1),
            amt:cb.items.reduce((a,x)=>a+itemValue(x,cb),0),n:cb.items.length,
            cnts:cb.items.map(x=>effCount(x,cb)),mixed:mixedGroupsOf(curProj()).length};});
  t('④ ★ 分成兩組', after.groups===2);
  t('④ 同組圖面編號一致', after.pure);
  t('④ 修完就不再警告', after.mixed===0);
  t('④ 條數沒變', after.n===before.n);
  t('④ ★ 金額完全沒動（'+before.amt+' → '+after.amt+'）', Math.abs(after.amt-before.amt)<0.5);
  t('④ ★ 每條的間數完全沒動', JSON.stringify(after.cnts)===JSON.stringify(before.cnts));
  t('④ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑤ 本來就正確的不要被誤判
{
  const {pg}=await open(mk(),'T');
  await pg.waitForTimeout(300);
  t('⑤ 正常的兩組不會被當成混在一起', await pg.evaluate(()=>mixedGroupsOf(curProj()).length)===0);
  t('⑤ 畫面上沒有紅字', !/混了不同的合約項目/.test(await pg.textContent('#app')));
  await pg.close();
}

// ⑥ 同一組裡兩道同名（打字少打「二次」）：要在源頭就警告
{
  const st=mk();
  // 東澤：圖面編號 H 那組，兩道都打成「封板」
  st.projects[1].blocks[0].items=[
    {id:'h1',no:'6.7',name:'口袋牆雙面隔間-骨架',unit:'㎡',qty:4.93,price:140,amount:690.2,
     srcId:'m0骨架',groupId:'gh',groupName:'口袋牆雙面隔間',remark:'圖面編號H'},
    {id:'h2',no:'6.7',name:'口袋牆雙面隔間-封板',unit:'㎡',qty:4.93,price:140,amount:690.2,
     srcId:'m0封板',groupId:'gh',groupName:'口袋牆雙面隔間',remark:'圖面編號H'},
    {id:'h3',no:'6.7',name:'口袋牆雙面隔間-封板',unit:'㎡',qty:4.93,price:140,amount:690.2,
     srcId:'m0二次封板',groupId:'gh',groupName:'口袋牆雙面隔間',remark:'圖面編號H'}];
  const {pg,errs}=await open(st,'T');
  await pg.waitForTimeout(300);
  const d=await pg.evaluate(()=>{const x=dupStagesOf(curProj());
    return {n:x.length,stages:x[0]?x[0].stages:[]};});
  t('⑥ 偵測到同名的工序', d.n===1&&d.stages.includes('封板'));
  const txt=await pg.textContent('#app');
  t('⑥ 畫面上警告並說明會被併成一條', /兩道同名/.test(txt)&&/併成一條/.test(txt));
  t('⑥ 把兩條排在一起並列出數量／單價／備註', /圖面編號H/.test(txt)&&/4\.93/.test(txt));
  t('⑥ 教你怎麼判斷（都一樣就刪、不一樣就改名）', /刪掉一條/.test(txt)&&/改名字/.test(txt));
  t('⑥ 每條都有「去改」直接跳過去', await pg.locator('[data-xcfind]').count()>=2);
  t('⑥ 沒有 JS 錯誤', errs.length===0);

  // 改開名字之後警告消失
  const gone=await pg.evaluate(()=>{
    curProj().blocks[0].items[2].name='口袋牆雙面隔間-二次封板'; save(); render();
    return {n:dupStagesOf(curProj()).length,warn:/兩道同名/.test(document.getElementById('app').innerText)};});
  t('⑥ 改開名字後警告消失', gone.n===0&&!gone.warn);

  // 改開之後轉過去才會是兩道
  const r=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    const sb=T.blocks[0];
    sb.items.slice().forEach(it=>xferApply(T,sb,it,C,6,140));
    save();
    const cb=C.blocks[0];
    return {n:cb.items.length,names:cb.items.map(x=>stageOf(x.name,x.groupName)),
            cnts:cb.items.map(x=>effCount(x,cb))};});
  t('⑦ 三道各自過去，沒有被併（3 條）', r.n===3);
  t('⑦ 名稱分別是骨架／封板／二次封板：'+r.names.join('、'),
    r.names.join(',')==='骨架,封板,二次封板');
  t('⑦ 每道都是 6 間，沒有誰變成 12', r.cnts.every(c=>c===6));
  await pg.close();
}

// ⑧ ★ 子專案自己分的組不可以被「自動分開」拆掉（骨架／封板／二次封板 來自母的不同條，但沒有同名）
{
  const st=mk();
  // 母專案：口袋牆那條沒有拆工序（單獨一條），另外兩條各自獨立
  st.projects[0].blocks[0].items=[
    {id:'p1',no:'6.7',name:'口袋牆雙面隔間-骨架',unit:'㎡',qty:4.93,price:300,amount:1479},
    {id:'p2',no:'6.7',name:'口袋牆雙面隔間-封板',unit:'㎡',qty:4.93,price:300,amount:1479,groupId:'mgx',groupName:'口袋牆雙面隔間'},
    {id:'p3',no:'6.7',name:'口袋牆雙面隔間-二次封板',unit:'㎡',qty:4.93,price:300,amount:1479,groupId:'mgx',groupName:'口袋牆雙面隔間'}];
  // 子專案三道的項次一致＝同一條合約項目，刻意分組，不該被拆
  // 子專案把三道收成一組（名稱沒有重複）
  st.projects[2].blocks[0].items=['骨架','封板','二次封板'].map((n,i)=>({
    id:'k'+i,no:'6.7',name:'口袋牆雙面隔間-'+n,unit:'㎡',qty:4.93,price:140,amount:690.2,
    srcId:['p1','p2','p3'][i],cnt:6,groupId:'kg',groupName:'口袋牆雙面隔間',remark:'圖面編號H'}));
  const {pg,errs}=await open(st,'C');
  await pg.waitForTimeout(300);
  t('⑧ ★ 項次一致 → 不判定為混在一起（即使溯源來自母的不同條）',
    await pg.evaluate(()=>mixedGroupsOf(curProj()).length)===0);
  t('⑧ 畫面上沒有紅字（不會叫你去拆掉自己分的組）',
    !/混了不同的合約項目/.test(await pg.textContent('#app')));
  t('⑧ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑨ 落單的工序要收得回去
{
  const st=mk();
  st.projects[2].blocks[0].items=[
    // 骨架落單（沒有 groupId），封板與二次封板是一組
    {id:'s0',no:'6.7',name:'口袋牆雙面隔間-骨架',unit:'㎡',qty:4.93,price:140,amount:690.2,srcId:'m0骨架',cnt:6},
    {id:'s1',no:'6.7',name:'口袋牆雙面隔間-封板',unit:'㎡',qty:4.93,price:140,amount:690.2,srcId:'m0封板',cnt:6,groupId:'kg',groupName:'口袋牆雙面隔間'},
    {id:'s2',no:'6.7',name:'口袋牆雙面隔間-二次封板',unit:'㎡',qty:4.93,price:140,amount:690.2,srcId:'m0二次封板',cnt:6,groupId:'kg',groupName:'口袋牆雙面隔間'}];
  const {pg,errs}=await open(st,'C');
  await pg.evaluate(()=>{ openBlk.add('bC'); render(); }); await pg.waitForTimeout(350);
  t('⑨ 偵測到 1 條落單', await pg.evaluate(()=>strayStagesOf(curProj().blocks[0]).length)===1);
  t('⑨ 有收回按鈕', await pg.locator('[data-groupjoin="bC"]').count()===1);
  const before=await pg.evaluate(()=>{const b=curProj().blocks[0];
    return {amt:b.items.reduce((a,x)=>a+itemValue(x,b),0),cnts:b.items.map(x=>effCount(x,b))};});
  await pg.click('[data-groupjoin="bC"]'); await pg.waitForTimeout(600);
  const after=await pg.evaluate(()=>{const b=curProj().blocks[0];
    return {gids:[...new Set(b.items.map(x=>x.groupId))],n:b.items.length,
            amt:b.items.reduce((a,x)=>a+itemValue(x,b),0),cnts:b.items.map(x=>effCount(x,b)),
            stray:strayStagesOf(b).length};});
  t('⑩ 三道收成同一組', after.gids.length===1&&after.gids[0]==='kg');
  t('⑩ 條數沒變', after.n===3);
  t('⑩ ★ 金額完全沒動（'+before.amt+' → '+after.amt+'）', Math.abs(after.amt-before.amt)<0.5);
  t('⑩ ★ 間數完全沒動', JSON.stringify(after.cnts)===JSON.stringify(before.cnts));
  t('⑩ 收完按鈕消失', after.stray===0);
  t('⑩ 收合行顯示 3 道工序',
    /3 道工序/.test(await pg.evaluate(()=>{const r=document.getElementById('row-kg');return r?r.innerText:'';})));
  t('⑩ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
