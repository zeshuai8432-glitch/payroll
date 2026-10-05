// 「轉進來了卻看不到」：把被兩個隱藏開關藏起來的細項講出來，並一鍵全部顯示
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 子專案：bC 有 2 條 0 元（剛轉進來、單價還沒填）＋ 1 條有金額；bD 一條都沒有
const seed=()=>({savedAt:Date.now(),tab:'items',cur:'C',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bA',name:'TYPE-EXS',unit:'間',count:6,items:[
      {id:'m1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:300,amount:3000},
      {id:'m2',no:'6.2',name:'壁龕',unit:'㎡',qty:2.5,price:280,amount:700}]}]},
  {id:'C',name:'凱子-代工-鑫',vendor:'鑫',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],
   hideZero:true,blocks:[
    {id:'bC',name:'TYPE-EXS',unit:'間',count:6,srcBlk:'bA',items:[
      {id:'z1',no:'6.1',name:'雙面隔間-骨架',unit:'㎡',qty:10,price:0,amount:0,srcId:'m1',cnt:2},
      {id:'z2',no:'6.1',name:'雙面隔間-封板',unit:'㎡',qty:10,price:0,amount:0,srcId:'m1',cnt:3},
      {id:'y1',no:'6.2',name:'壁龕',unit:'㎡',qty:2.5,price:140,amount:350,srcId:'m2',cnt:6}]},
    {id:'bD',name:'TYPE-L',unit:'間',count:3,items:[]}]}]});

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

{
  const {pg,errs}=await open(seed());
  await pg.evaluate(()=>{ openBlk.add('bC'); render(); }); await pg.waitForTimeout(400);

  const app=await pg.textContent('#app');
  t('① ★ 直接講出有東西沒顯示', /這一頁有東西沒顯示出來/.test(app));
  const html=await pg.innerHTML('#app');
  t('① ★ 數對：2 條 0 元 ＋ 1 個空區塊',
    /<b>2<\/b> 條 0 元的細項/.test(html)&&/已隱藏 <b>1<\/b> 個沒有細項的區塊/.test(html));
  t('① 講明沒有刪掉、只是被勾勾藏起來', /沒有刪掉/.test(app)&&/勾勾藏起來/.test(app));
  t('① 點出這就是「轉進來卻看不到」的原因', /轉進來了卻看不到/.test(app));
  t('① 有「全部顯示」按鈕', await pg.locator('#show-all-items').count()===1);

  // 這兩條 0 元的現在真的看不到
  t('② 0 元那兩列目前看不到',
    await pg.locator('#row-z1').count()===0&&await pg.locator('#row-z2').count()===0);
  t('② 有金額那列看得到', await pg.locator('#row-y1').count()===1);

  await pg.click('#show-all-items'); await pg.waitForTimeout(600);
  t('③ ★ 按下去 0 元那兩列就出現了',
    await pg.locator('#row-z1').count()===1&&await pg.locator('#row-z2').count()===1);
  t('③ ★ 空的區塊也出現了（3 個 details：bC、bD）',
    await pg.locator('details.blk').count()===2);
  t('③ 兩個勾勾都被取消', await pg.evaluate(()=>{
    const p=curProj(); return p.hideZero===false&&p.hideEmptyBlk===false; }));
  t('③ 提示自己消失了', !/這一頁有東西沒顯示出來/.test(await pg.textContent('#app')));
  t('③ 間數看得到（2 間／3 間）', /2 間/.test(await pg.textContent('#row-z1'))
    &&/3 間/.test(await pg.textContent('#row-z2')));
  t('③ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ④ 沒有東西被藏起來時不要跳這個提示
{
  const st=seed();
  st.projects[1].hideZero=false; st.projects[1].hideEmptyBlk=false;
  st.projects[1].blocks.pop();   // 拿掉空區塊
  const {pg}=await open(st);
  await pg.waitForTimeout(400);
  t('④ 沒東西被藏就不囉嗦', !/這一頁有東西沒顯示出來/.test(await pg.textContent('#app')));
  t('④ 也沒有按鈕', await pg.locator('#show-all-items').count()===0);
  await pg.close();
}

// ⑤ 只有空區塊被藏（沒有 0 元細項）→ 只講區塊
{
  const st=seed();
  st.projects[1].hideZero=false;
  st.projects[1].blocks[0].items=st.projects[1].blocks[0].items.filter(x=>x.id==='y1');
  const {pg}=await open(st);
  await pg.waitForTimeout(400);
  const app=await pg.textContent('#app');
  t('⑤ 只講區塊，不講 0 元',
    /已隱藏 <b>1<\/b> 個沒有細項的區塊/.test(await pg.innerHTML('#app'))&&!/條 0 元/.test(app));
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
