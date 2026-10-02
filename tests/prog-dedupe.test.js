// 群組名改過就對不上 → 不可以一直長出新的一條；已經重複的要併得回來
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

const seed=()=>({savedAt:Date.now(),tab:'items',cur:'C',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bA',name:'TYPE-EXS',unit:'間',count:40,items:[
      {id:'m1',no:'6.11',name:'電視牆二次隔間',unit:'㎡',qty:16.18,price:300,amount:4854}]}]},
  // 東澤把母那條拆成骨架／封板，而且群組名改成「電視牆二次複牆」
  {id:'T',name:'凱子-代工-東澤',vendor:'東澤',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bT',name:'TYPE-EXS',unit:'間',count:40,srcBlk:'bA',items:[
      {id:'t1',no:'6.11',name:'電視牆二次複牆-骨架',unit:'㎡',qty:16.18,price:140,amount:2265.2,
       srcId:'m1',groupId:'gT',groupName:'電視牆二次複牆',remark:'圖面編號B'},
      {id:'t2',no:'6.11',name:'電視牆二次複牆-封板',unit:'㎡',qty:16.18,price:140,amount:2265.2,
       srcId:'m1',groupId:'gT',groupName:'電視牆二次複牆',remark:'圖面編號B'}]}]},
  // 接手方那邊群組名還是舊的「電視牆二次隔間」
  {id:'C',name:'凱子-代工-鑫',vendor:'鑫',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bC',name:'TYPE-EXS',unit:'間',count:40,srcBlk:'bA',items:[
      {id:'c1',no:'6.11',name:'電視牆二次隔間-骨架',unit:'㎡',qty:16.18,price:140,amount:2265.2,
       srcId:'m1',groupId:'gC',groupName:'電視牆二次隔間',cnt:1,remark:'圖面編號B'},
      {id:'c2',no:'6.11',name:'電視牆二次隔間-封板',unit:'㎡',qty:16.18,price:140,amount:2265.2,
       srcId:'m1',groupId:'gC',groupName:'電視牆二次隔間',cnt:6,remark:'圖面編號B'}]}]}]});

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

// ① ★ 群組名不同，但工序名一樣 → 要累加，不可以另開一條
{
  const {pg,errs}=await open(seed());
  const r=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    const sb=T.blocks[0];
    xferApply(T,sb,sb.items.find(x=>x.id==='t1'),C,2,140);   // 骨架再轉 2 間
    save();
    const cb=C.blocks[0];
    return {n:cb.items.length,names:cb.items.map(x=>x.name),
            cnts:cb.items.map(x=>effCount(x,cb))};
  });
  t('① ★ 沒有長出第三條（仍然 2 條）', r.n===2);
  t('① ★ 骨架累加成 3 間（1＋2）', r.cnts[0]===3);
  t('① 封板沒被動到（6 間）', r.cnts[1]===6);
  t('① 接手方自己的群組名保留，沒被來源蓋掉', /電視牆二次隔間-骨架/.test(r.names[0]));
  t('① 沒有 JS 錯誤', errs.length===0);

  // 再轉一次照舊累加，不會越轉越多條
  const r2=await pg.evaluate(()=>{
    const T=state.projects.find(p=>p.id==='T'), C=state.projects.find(p=>p.id==='C');
    const sb=T.blocks[0];
    xferApply(T,sb,sb.items.find(x=>x.id==='t1'),C,1,140);
    save();
    const cb=C.blocks[0];
    return {n:cb.items.length,cnt:effCount(cb.items[0],cb)};
  });
  t('② 第三次轉入仍然 2 條、骨架 4 間', r2.n===2&&r2.cnt===4);
  await pg.close();
}

// ③ 已經壞掉的資料（同一道骨架被拆成三條）要偵測得到並併回一條
{
  const st=seed();
  st.projects[2].blocks[0].items=[
    {id:'d1',no:'6.11',name:'電視牆二次隔間-骨架',unit:'㎡',qty:16.18,price:140,amount:2265.2,
     srcId:'m1',groupId:'gC',groupName:'電視牆二次隔間',cnt:1,remark:'圖面編號B',xlog:['x1','x2']},
    {id:'d2',no:'6.11',name:'電視牆二次隔間-封板',unit:'㎡',qty:16.18,price:140,amount:2265.2,
     srcId:'m1',groupId:'gC',groupName:'電視牆二次隔間',cnt:6,remark:'圖面編號B'},
    {id:'d3',no:'6.11',name:'電視牆二次複牆-骨架',unit:'㎡',qty:16.18,price:140,amount:2265.2,
     srcId:'m1',groupId:'gC',groupName:'電視牆二次複牆',cnt:1,remark:'圖面編號B',xlog:['x3']}];
  const {pg,errs}=await open(st);
  await pg.waitForTimeout(300);
  const d=await pg.evaluate(()=>{const x=dupItemsOf(curProj());
    return {n:x.length,stage:x[0]?x[0].stage:'',rows:x[0]?x[0].items.length:0};});
  t('③ 偵測到 1 道重複、共 2 條', d.n===1&&d.rows===2&&/骨架/.test(d.stage));
  const txt=await pg.textContent('#app');
  t('③ 畫面上列出各條間數與併完的結果', /1 ＋ 1/.test(txt)&&/重複出現/.test(txt));
  t('③ 有修復按鈕', await pg.locator('#fix-dupitems').count()===1);

  await pg.click('#fix-dupitems'); await pg.waitForTimeout(700);
  const r=await pg.evaluate(()=>{const b=curProj().blocks[0];
    return {n:b.items.length,names:b.items.map(x=>x.name),cnts:b.items.map(x=>effCount(x,b)),
            xlog:(b.items[0].xlog||[]),trash:(curProj().trash||[]).length,
            dup:dupItemsOf(curProj()).length};});
  t('④ ★ 併回一條（剩 2 條：骨架＋封板）', r.n===2);
  t('④ ★ 骨架間數相加成 2（1＋1）', r.cnts[0]===2);
  t('④ 封板沒被動到（6 間）', r.cnts[1]===6);
  t('④ 被併掉的進回收桶（救得回來）', r.trash===1);
  t('④ 兩邊的轉出入紀錄都保留，並記下這次合併',
    r.xlog.includes('x1')&&r.xlog.includes('x3')&&r.xlog.some(x=>/合併重複的 2 條/.test(x)));
  t('④ 修完不再警告', r.dup===0);
  t('④ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑤ 工序名一樣但溯源是兩個不同的母細項 → 不可以併（那是真的不同的合約項目）
{
  const st=seed();
  st.projects[0].blocks[0].items.push({id:'m2',no:'6.12',name:'口袋牆',unit:'㎡',qty:2.41,price:300,amount:723});
  st.projects[2].blocks[0].items=[
    {id:'e1',no:'6.11',name:'雙面隔間-塞棉',unit:'㎡',qty:14.71,price:30,amount:441.3,srcId:'m1',cnt:1,
     groupId:'gE',groupName:'雙面隔間',remark:'圖面編號D/F'},
    {id:'e2',no:'6.12',name:'雙面隔間-塞棉',unit:'㎡',qty:2.41,price:30,amount:72.3,srcId:'m2',cnt:1,
     groupId:'gE',groupName:'雙面隔間',remark:'圖面編號C'}];
  const {pg}=await open(st);
  await pg.waitForTimeout(300);
  t('⑤ ★ 溯源不同就不當成重複（不會被併掉）', await pg.evaluate(()=>dupItemsOf(curProj()).length)===0);
  const txt=await pg.textContent('#app');
  t('⑤ 但「同一組兩道同名」還是會警告，要你去分開', /兩道同名/.test(txt));
  t('⑤ 並列出兩條的數量差異讓你判斷', /14\.71/.test(txt)&&/2\.41/.test(txt));
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
