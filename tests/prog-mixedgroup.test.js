// 同名但不同條的合約項目，不可以被併成同一個工序群組
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 母專案兩條都叫「雙面隔間」，只差圖面編號；各自拆成 3 道工序
const mk=()=>{
  const mItems=[];
  ['D/F','C'].forEach((plan,i)=>['骨架','封板','二次封板'].forEach(st=>{
    mItems.push({id:`m${i}${st}`,no:'6.3',name:`雙面隔間-${st}`,unit:'㎡',qty:9.15,price:300,
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
  t('③ 偵測到 1 組混在一起（6 道、2 條合約項目）',
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

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
