// 合約明細要看得到「這條這家拿到幾間」
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

const seed=()=>({savedAt:Date.now(),tab:'items',cur:'C',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bA',name:'TYPE-EXS',unit:'間',count:40,items:[
      {id:'m1',no:'6.4',name:'門上雙面隔間',unit:'㎡',qty:4.2,price:300,amount:1260},
      {id:'m2',no:'6.6',name:'雙面隔間',unit:'㎡',qty:3,price:300,amount:900},
      {id:'m3',no:'6.9',name:'壁龕',unit:'㎡',qty:2.5,price:280,amount:700}]}]},
  {id:'C',name:'凱子-代工-鑫',vendor:'鑫',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bC',name:'TYPE-EXS',unit:'間',count:40,srcBlk:'bA',items:[
      // 轉入 6 間 → cnt 6（跟區塊 40 不同）
      {id:'c1',no:'6.4',name:'門上雙面隔間-骨架',unit:'㎡',qty:4.2,price:140,amount:588,srcId:'m1',cnt:6,
       groupId:'g1',groupName:'門上雙面隔間'},
      {id:'c2',no:'6.4',name:'門上雙面隔間-封板',unit:'㎡',qty:4.2,price:140,amount:588,srcId:'m1',cnt:3,
       groupId:'g1',groupName:'門上雙面隔間'},
      // 沒設 cnt → 照區塊的 40 間，舊版完全不顯示
      {id:'c3',no:'6.6',name:'雙面隔間',unit:'㎡',qty:3,price:140,amount:420,srcId:'m2'},
      {id:'c4',no:'6.9',name:'壁龕',unit:'㎡',qty:2.5,price:140,amount:350,srcId:'m3',cnt:6}]}]}]});

(async()=>{
const br=await chromium.launch();
const open=async(st,cur)=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(800);
  if(cur) await pg.evaluate(c=>{state.cur=c;render();},cur);
  return {pg,errs};
};
const rowText=(pg,id)=>pg.evaluate(i=>{const r=document.getElementById('row-'+i);return r?r.innerText.replace(/\s+/g,' '):'(沒有這一列)';},id);

// ① 子專案：每條都看得到間數，包含「照區塊」那種
{
  const {pg,errs}=await open(seed());
  await pg.evaluate(()=>{ openBlk.add('bC'); openGroup.add('g1'); render(); }); await pg.waitForTimeout(350);
  const r3=await rowText(pg,'c3'), r4=await rowText(pg,'c4');
  t('① 有個別設定的看得到（壁龕 6 間）：'+r4.slice(0,24), /6 間/.test(r4));
  t('② ★ 沒個別設定的也看得到（照區塊 40 間）：'+r3.slice(0,24), /40 間/.test(r3));
  t('① 沒有 JS 錯誤', errs.length===0);

  // 工序子列各自的量
  const s1=await rowText(pg,'c1'), s2=await rowText(pg,'c2');
  t('③ 工序子列各自顯示（骨架 6）', /6 間/.test(s1));
  t('③ 工序子列各自顯示（封板 3）', /3 間/.test(s2));

  // 收合行：兩道不一樣 → 要講清楚範圍，不能裝成一個數字
  const g=await pg.evaluate(()=>{const r=document.getElementById('row-g1');return r?r.innerText.replace(/\s+/g,' '):'';});
  t('④ ★ 收合行標出各道不同（3–6 間）：'+g.slice(-26), /各道不同 3–6 間/.test(g));
  await pg.close();
}

// ⑤ 兩道工序量一樣時，收合行顯示單一數字
{
  const st=seed(); st.projects[1].blocks[0].items[1].cnt=6;
  const {pg}=await open(st);
  await pg.evaluate(()=>{ openBlk.add('bC'); render(); }); await pg.waitForTimeout(350);
  const g=await pg.evaluate(()=>{const r=document.getElementById('row-g1');return r?r.innerText.replace(/\s+/g,' '):'';});
  t('⑤ 兩道一樣 → 收合行顯示 6 間，不講範圍', /6 間/.test(g)&&!/各道不同/.test(g));
  await pg.close();
}

// ⑥ 母專案不要被灌滿雜訊：只有跟合約不同的才顯示
{
  const st=seed();
  st.projects[0].blocks[0].items[1].cnt=24;   // 母專案其中一條實作量不同
  const {pg}=await open(st,'A');
  await pg.evaluate(()=>{ openBlk.add('bA'); render(); }); await pg.waitForTimeout(350);
  const m1=await rowText(pg,'m1'), m2=await rowText(pg,'m2');
  t('⑥ 母專案照合約的那條不顯示間數（不當雜訊）', !/40 間/.test(m1));
  t('⑥ 母專案實作量不同的那條照樣顯示（24 間）', /24 間/.test(m2));
  await pg.close();
}

// ⑦ 轉入之後間數要跟著變（看得到累計拿到幾間）
{
  const st=seed();
  const {pg}=await open(st);
  await pg.evaluate(()=>{
    const A=state.projects[0], C=state.projects[1];
    // 另一家 D 把 2 間轉給鑫的「壁龕」
    const D={id:'D',name:'凱子-代工-東澤',vendor:'東澤',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],
      blocks:[{id:'bD',name:'TYPE-EXS',unit:'間',count:40,srcBlk:'bA',
        items:[{id:'d1',no:'6.9',name:'壁龕',unit:'㎡',qty:2.5,price:140,amount:350,srcId:'m3',cnt:5}]}]};
    state.projects.push(D);
    xferApply(D,D.blocks[0],D.blocks[0].items[0],C,2,140);
    save(); openBlk.add('bC'); render();
  }); await pg.waitForTimeout(400);
  const r=await rowText(pg,'c4');
  t('⑦ 壁龕從 6 間變 8 間（6＋轉入 2），一眼看得到', /8 間/.test(r));
  t('⑦ 並掛上轉出入紀錄標籤', /⇄/.test(r));
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
