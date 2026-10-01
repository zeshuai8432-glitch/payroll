// 每個分頁都看得到的那條提示列：合併過的子合約不能誤報超額，真超額要報
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// A：代工母專案，一條對一條。6.1/6.2/6.3 每間共 300，3 間＝900
const mk=kids=>({savedAt:Date.now(),tab:'items',cur:'A',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,trash:[],periods:[],blocks:[
    {id:'bA',name:'TYPE-EXS',unit:'間',count:3,items:[
      {id:'i1',no:'6.1',name:'雙面隔間-C型鋼骨架',unit:'㎡',qty:10,price:120,amount:1200},
      {id:'i2',no:'6.2',name:'雙面隔間-封矽酸鈣板',unit:'㎡',qty:10,price:100,amount:1000},
      {id:'i3',no:'6.3',name:'雙面隔間-填充岩棉',unit:'㎡',qty:10,price:80,amount:800}]}]},
  ...kids]});

// B＝他自己，把三條合併成一條（名稱、數量、金額都重寫），金額加總不變
const B=(amt)=>({id:'B',name:'凱子-代工-自己',vendor:'自己',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
  {id:'bB',name:'TYPE-EXS',unit:'間',count:3,srcBlk:'bA',items:[
    {id:'j1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:30,price:amt/30,amount:amt,srcId:'i1'}]}]});

(async()=>{
const br=await chromium.launch();
const open=async st=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(800);
  return {pg,errs};
};
const notice=pg=>pg.evaluate(()=>{const n=document.querySelector('#app .notice');return n?n.innerText.replace(/\s+/g,' '):'';});

// ① 合併過但金額相符 → 不能報超額（這是舊版的假警報）
{
  const {pg,errs}=await open(mk([B(3000)]));   // 母每間 3000，B 也 3000 → 剛好打平
  const n=await notice(pg);
  t('① 合併過的子合約不報「細項超過」：'+n.slice(0,46), !/細項.*超過/.test(n));
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② 金額相符時要顯示正確的已發包／剩餘（房型層級）
{
  const {pg}=await open(mk([B(3000)]));
  const n=await notice(pg);
  // 母每間 1200+1000+800=3000，×3 間＝9,000。B 每間 3000 ×3＝9,000 → 全部發掉，剩 0
  t('② 已發包＝9,000（房型層級算得出來）', /已發包 \$?9,000/.test(n));
  t('② 剩餘＝0', /剩餘 \$?0/.test(n));
  t('② 母專案總額＝9,000', /母專案總額 \$?9,000/.test(n));
  t('② 不紅字', !/超過/.test(n));
  await pg.close();
}

// ③ 真的超額（轉出時單價談高了）→ 一定要報，而且講房型不講細項
{
  const {pg}=await open(mk([B(3500)]));   // 每間 3500 > 母 3000
  const n=await notice(pg);
  t('③ 真超額會報：'+n.slice(0,56), /⚠/.test(n)&&/房型發包金額超過母合約/.test(n));
  t('③ 不再用「細項超過母專案的量」的說法', !/細項/.test(n));
  const red=await pg.evaluate(()=>{const e=document.querySelector('#app .notice');
    return e?getComputedStyle(e).borderColor+'|'+getComputedStyle(e).color:'';});
  t('③ 整條變紅', /248, 113, 113|252, 165, 165/.test(red));
  await pg.close();
}

// ④ 多家加起來才超：B 沒超，B+C 超
{
  const C={id:'C',name:'凱子-代工-阿華',vendor:'阿華',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bC',name:'TYPE-EXS',unit:'間',count:3,srcBlk:'bA',items:[
      {id:'k1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:60,amount:600,srcId:'i1'}]}]};
  const {pg}=await open(mk([B(2800),C]));   // 2800+600=3400/間 > 3000
  const n=await notice(pg);
  t('④ B+C 加起來超過才報', /房型發包金額超過母合約/.test(n));
  await pg.close();
  const {pg:pg2}=await open(mk([B(2000),C]));   // 2000+600=2600 < 3000
  const n2=await notice(pg2);
  t('④ 沒超就不報，並顯示剩餘 1,200', !/超過/.test(n2)&&/剩餘 \$?1,200/.test(n2));
  await pg2.close();
}

// ⑤ 對不到母區塊的子區塊（錢真的發出去了）要在提示列講出來，不能默默漏掉
{
  const S={id:'S',name:'凱子-代工-散工',vendor:'散工',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bS',name:'臨時追加區',unit:'間',count:1,items:[
      {id:'s1',no:'',name:'零星補強',unit:'式',qty:1,price:5000,amount:5000}]}]};
  const {pg}=await open(mk([B(2000),S]));
  const n=await notice(pg);
  t('⑤ 對不到母合約的子區塊會點出來：'+(n.match(/另有[^。]*/)||[''])[0], /另有 1 個子區塊對不到母合約/.test(n));
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
