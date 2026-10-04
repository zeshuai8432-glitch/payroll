// 分組一律照「項次」：合約給的，使用者不會改
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 他的真實狀況：一組裡 1 條 D/F（項次 6.3）＋ 3 條 C（項次 6.4）
const seed=()=>({savedAt:Date.now(),tab:'items',cur:'C',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bA',name:'TYPE-EXS',unit:'間',count:40,items:[
      {id:'m1',no:'6.3',name:'雙面隔間',unit:'㎡',qty:14.71,price:300,amount:4413},
      {id:'m2',no:'6.4',name:'雙面隔間',unit:'㎡',qty:2.41,price:300,amount:723}]}]},
  {id:'C',name:'凱子-代工-鑫',vendor:'鑫',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bC',name:'TYPE-EXS',unit:'間',count:40,srcBlk:'bA',items:[
      {id:'x1',no:'6.3',name:'雙面隔間-塞棉',unit:'㎡',qty:14.71,price:30,amount:441.3,
       srcId:'m1',cnt:1,groupId:'gx',groupName:'雙面隔間',remark:'圖面編號D/F'},
      {id:'x2',no:'6.4',name:'雙面隔間-塞棉',unit:'㎡',qty:2.41,price:30,amount:72.3,
       srcId:'m2',cnt:1,groupId:'gx',groupName:'雙面隔間',remark:'圖面編號C'},
      {id:'x3',no:'6.4',name:'雙面隔間-二次骨架',unit:'㎡',qty:2.41,price:140,amount:337.4,
       cnt:6,groupId:'gx',groupName:'雙面隔間',remark:'圖面編號C'},
      {id:'x4',no:'6.4',name:'雙面隔間-二次封板',unit:'㎡',qty:2.41,price:140,amount:337.4,
       srcId:'m2',cnt:1,groupId:'gx',groupName:'雙面隔間',remark:'圖面編號C'}]}]}]});

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

// ① 偵測：不同項次在同一組 → 混了（連沒有溯源的 x3 也要跟著它的項次走）
{
  const {pg,errs}=await open(seed());
  await pg.evaluate(()=>{ openBlk.add('bC'); openGroup.add('gx'); render(); }); await pg.waitForTimeout(350);
  const m=await pg.evaluate(()=>{const x=mixedGroupsOf(curProj());
    return {n:x.length,keys:x[0]?x[0].keys:[],items:x[0]?x[0].items.length:0};});
  t('① 偵測到 1 組混在一起', m.n===1&&m.items===4);
  t('① 認出是項次 6.3 與 6.4 兩條：'+m.keys.join('、'), m.keys.join(',')==='6.3,6.4');
  t('① 畫面上把項次寫出來', /項次 6\.3、6\.4/.test(await pg.textContent('#app')));
  t('① 沒有 JS 錯誤', errs.length===0);

  // ★ 工序子列要看得到自己的項次（原本那一格是空的）
  const r2=await pg.evaluate(()=>{const r=document.getElementById('row-x2');return r?r.innerText.replace(/\s+/g,' '):'';});
  const r3=await pg.evaluate(()=>{const r=document.getElementById('row-x3');return r?r.innerText.replace(/\s+/g,' '):'';});
  t('② ★ 工序子列顯示項次 6.4：'+r2.slice(0,18), /6\.4/.test(r2)&&/6\.4/.test(r3));

  // 照項次分開
  await pg.click('#fix-mixedg'); await pg.waitForTimeout(700);
  const r=await pg.evaluate(()=>{
    const b=curProj().blocks[0];
    const by={}; b.items.forEach(x=>(by[x.groupId||'(無)']=by[x.groupId||'(無)']||[]).push(x.no));
    return {groups:Object.keys(by).length,sets:Object.values(by),
      amt:b.items.reduce((a,x)=>a+itemValue(x,b),0),cnts:b.items.map(x=>effCount(x,b)),
      mixed:mixedGroupsOf(curProj()).length,n:b.items.length};
  });
  t('③ ★ 分成兩組', r.groups===2);
  t('③ 每組裡的項次一致', r.sets.every(g=>new Set(g).size===1));
  t('③ 6.3 那組 1 道、6.4 那組 3 道',
    r.sets.some(g=>g.length===1&&g[0]==='6.3')&&r.sets.some(g=>g.length===3&&g[0]==='6.4'));
  t('③ 條數沒變（4 條）', r.n===4);
  t('③ ★ 金額完全沒動（'+Math.round(r.amt)+'）', Math.abs(r.amt-(441.3*1+72.3*1+337.4*6+337.4*1))<0.5);
  t('③ ★ 間數完全沒動', JSON.stringify(r.cnts)==='[1,1,6,1]');
  t('③ 修完不再警告', r.mixed===0);

  // 分開之後「兩道同名」的警告也跟著消失（兩個塞棉在不同組了）
  t('③ 同名警告也消失', await pg.evaluate(()=>dupStagesOf(curProj()).length)===0);
  await pg.close();
}

// ④ 項次一樣的不可以被拆（子專案把母的幾條收成一組是正常用法）
{
  const st=seed();
  st.projects[1].blocks[0].items=['骨架','封板','二次封板'].map((n,i)=>({
    id:'g'+i,no:'6.4',name:'門上雙面隔間-'+n,unit:'㎡',qty:4.2,price:140,amount:588,
    srcId:['m1','m2','m2'][i],cnt:6,groupId:'gg',groupName:'門上雙面隔間'}));
  const {pg}=await open(st);
  await pg.waitForTimeout(300);
  t('④ ★ 項次都一樣 → 不判定為混在一起（即使溯源不同）',
    await pg.evaluate(()=>mixedGroupsOf(curProj()).length)===0);
  t('④ 畫面上沒有紅字', !/混了不同的合約項目/.test(await pg.textContent('#app')));
  await pg.close();
}

// ⑤ 轉入時照項次併組，不會把別條合約項目的工序拉進來
{
  const st=seed();
  // 每組兩道，否則開機時「只剩一道的群組」會被自動解除，情境不成立
  st.projects[1].blocks[0].items=[
    {id:'y1',no:'6.3',name:'雙面隔間-塞棉',unit:'㎡',qty:14.71,price:30,amount:441.3,
     srcId:'m1',cnt:1,groupId:'g63',groupName:'雙面隔間'},
    {id:'y1b',no:'6.3',name:'雙面隔間-封板',unit:'㎡',qty:14.71,price:140,amount:2059.4,
     srcId:'m1',cnt:1,groupId:'g63',groupName:'雙面隔間'},
    {id:'y2',no:'6.4',name:'雙面隔間-塞棉',unit:'㎡',qty:2.41,price:30,amount:72.3,
     srcId:'m2',cnt:1,groupId:'g64',groupName:'雙面隔間'},
    {id:'y2b',no:'6.4',name:'雙面隔間-二次封板',unit:'㎡',qty:2.41,price:140,amount:337.4,
     srcId:'m2',cnt:1,groupId:'g64',groupName:'雙面隔間'}];
  st.projects.push({id:'T',name:'凱子-代工-東澤',vendor:'東澤',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],
    blocks:[{id:'bT',name:'TYPE-EXS',unit:'間',count:40,srcBlk:'bA',items:[
      {id:'t4',no:'6.4',name:'雙面隔間-二次骨架',unit:'㎡',qty:2.41,price:140,amount:337.4,
       srcId:'m2',cnt:6,groupId:'gT',groupName:'雙面隔間'},
      // 東澤那邊也要兩道，否則「只剩一道的群組」開機就被解除，來源沒有群組資訊
      {id:'t5',no:'6.4',name:'雙面隔間-三次封板',unit:'㎡',qty:2.41,price:140,amount:337.4,
       srcId:'m2',cnt:6,groupId:'gT',groupName:'雙面隔間'}]}]});
  const {pg}=await open(st);
  const r=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    xferApply(T,T.blocks[0],T.blocks[0].items[0],C,6,140);
    save();
    const b=C.blocks[0];
    const it=b.items.find(x=>/二次骨架/.test(x.name));
    return {gid:it?it.groupId:'',g63:b.items.find(x=>x.id==='y1').groupId,
            g64:b.items.find(x=>x.id==='y2').groupId,n:b.items.length,
            mixed:mixedGroupsOf(C).length};
  });
  t('⑤ ★ 轉進來的 6.4 併進 6.4 那組，不是 6.3 那組', !!r.gid&&r.gid===r.g64&&r.gid!==r.g63);
  t('⑤ 兩組的項次各自一致，沒有被混到', r.mixed===0);
  t('⑤ 總共 5 條', r.n===5);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
