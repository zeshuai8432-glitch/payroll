// 名稱被疊兩次的工序：改名不可以再疊，而且要收得回群組
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

const LONG='洗手台壁龕單面壁板；含C65輕鋼骨架、單面封單層9mm/THK纖維水泥板H:2600mm(至天花板)';
// 他現場的狀況：一條落單的「骨架」名稱被疊了一次，項次 6.9 跟那一組一樣
const seed=()=>({savedAt:Date.now(),tab:'items',cur:'C',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bA',name:'TYPE-K.1',unit:'間',count:6,items:[
      {id:'m1',no:'6.9',name:LONG,unit:'㎡',qty:3,price:300,amount:900}]}]},
  {id:'C',name:'凱子-代工-鑫',vendor:'鑫',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bC',name:'TYPE-K.1',unit:'間',count:6,srcBlk:'bA',items:[
      // ← 落單的那條：名稱疊了一次，沒有 groupId
      {id:'s1',no:'6.9',name:LONG+'；含C65輕鋼骨架、單面封單層9mm/THK纖維水泥板H:2600mm(至天花板)-骨架',
       unit:'㎡',qty:3,price:140,amount:420,srcId:'m1',cnt:3,remark:'圖面編號I',xlog:['a']},
      {id:'g1',no:'6.9',name:LONG+'-骨架',unit:'㎡',qty:3,price:140,amount:420,srcId:'m1',cnt:3,
       groupId:'gg',groupName:LONG,remark:'TYPE-K.1'},
      {id:'g2',no:'6.9',name:LONG+'-封板',unit:'㎡',qty:3,price:140,amount:420,srcId:'m1',cnt:6,
       groupId:'gg',groupName:LONG,remark:'TYPE-K.1'}]}]}]});

(async()=>{
const br=await chromium.launch();
const open=async st=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.evaluate(()=>{ openBlk.add('bC'); openGroup.add('gg'); render(); });
  await pg.waitForTimeout(400);
  return {pg,errs};
};

// ① 名稱疊過的落單條目：照項次也要認得出來，並給收回按鈕
{
  const {pg,errs}=await open(seed());
  const st=await pg.evaluate(()=>strayStagesOf(curProj().blocks[0]).map(x=>({id:x.it.id,stage:x.stage})));
  t('① ★ 名稱前綴對不上，但照項次 6.9 認得出來', st.length===1&&st[0].id==='s1');
  t('① 工序名抓到「骨架」', st[0].stage==='骨架');
  t('① 有收回按鈕', await pg.locator('[data-groupjoin="bC"]').count()===1);
  t('① 沒有 JS 錯誤', errs.length===0);

  const before=await pg.evaluate(()=>{const b=curProj().blocks[0];
    return {amt:b.items.reduce((a,x)=>a+itemValue(x,b),0),cnts:b.items.map(x=>effCount(x,b))};});
  await pg.click('[data-groupjoin="bC"]'); await pg.waitForTimeout(650);
  const r=await pg.evaluate(()=>{const b=curProj().blocks[0];
    const it=b.items.find(x=>x.id==='s1');
    return {gid:it.groupId,gn:it.groupName,nm:it.name,
      gids:[...new Set(b.items.map(x=>x.groupId))],n:b.items.length,
      amt:b.items.reduce((a,x)=>a+itemValue(x,b),0),cnts:b.items.map(x=>effCount(x,b)),
      log:(it.xlog||[]).join('|'),rk:it.remark||''};});
  t('② ★ 收進同一組（3 道工序）', r.gid==='gg'&&r.gids.length===1&&r.n===3);
  t('② ★ 名稱順便修正成「群組名-骨架」，不再疊兩次',
    r.nm===LONG+'-骨架'&&r.nm.split('至天花板').length===2);
  t('② 金額完全沒動（'+Math.round(r.amt)+'）', Math.abs(r.amt-before.amt)<0.5);
  t('② 間數完全沒動', JSON.stringify(r.cnts)===JSON.stringify(before.cnts));
  t('② 轉出入紀錄與自己寫的備註都留著', /a/.test(r.log)&&r.rk==='圖面編號I');
  await pg.close();
}

// ③ ★ 改群組名稱不可以把名稱疊兩次（名稱與 groupName 不一致時）
{
  const st=seed();
  // 製造不一致：groupName 是對的，但 name 多了一段
  st.projects[1].blocks[0].items=[
    {id:'g1',no:'6.9',name:LONG+'；多出來的一段-骨架',unit:'㎡',qty:3,price:140,amount:420,
     srcId:'m1',cnt:3,groupId:'gg',groupName:LONG},
    {id:'g2',no:'6.9',name:LONG+'-封板',unit:'㎡',qty:3,price:140,amount:420,
     srcId:'m1',cnt:6,groupId:'gg',groupName:LONG}];
  const {pg,errs}=await open(st);
  const r=await pg.evaluate(()=>{
    const b=curProj().blocks[0];
    const inp={value:'洗手台壁龕單面壁板',dataset:{gname:'bC::gg'}};
    // 直接走改名那段邏輯
    const subs=b.items.filter(x=>x.groupId==='gg');
    const old=subs[0].groupName||'', nv='洗手台壁龕單面壁板';
    subs.forEach(x=>{
      let s2=stageOf(x.name,old);
      if(s2===x.name){ const i=String(x.name||'').lastIndexOf('-'); if(i>0) s2=String(x.name).slice(i+1); }
      x.groupName=nv; x.name=s2&&s2!==x.name?`${nv}-${s2}`:nv;
    });
    save();
    return b.items.map(x=>x.name);
  });
  t('③ ★ 對不上時取最後一個「-」後面那段，不整串疊上去',
    r[0]==='洗手台壁龕單面壁板-骨架'&&r[1]==='洗手台壁龕單面壁板-封板');
  t('③ 名稱裡不會出現兩次「至天花板」', !r.some(x=>x.split('至天花板').length>2));
  t('③ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ④ 從畫面實際改名（收合行點一下改名稱）也不能疊
{
  const {pg,errs}=await open(seed());
  await pg.click('[data-groupjoin="bC"]'); await pg.waitForTimeout(600);   // 先收回，變 3 道
  await pg.evaluate(()=>{ gEdit='bC::gg::name'; render(); }); await pg.waitForTimeout(350);
  await pg.fill('[data-gname="bC::gg"]','洗手台壁龕');
  await pg.evaluate(()=>{ const el=document.querySelector('[data-gname="bC::gg"]');
    el.dispatchEvent(new Event('change',{bubbles:true})); });
  await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>curProj().blocks[0].items.map(x=>x.name));
  t('④ ★ 三道都變成「洗手台壁龕-工序名」', r.join('／')==='洗手台壁龕-骨架／洗手台壁龕-骨架／洗手台壁龕-封板'
    ||r.every(x=>/^洗手台壁龕-/.test(x)));
  t('④ 沒有任何名稱被疊兩次', !r.some(x=>x.split('洗手台壁龕').length>2));
  t('④ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
