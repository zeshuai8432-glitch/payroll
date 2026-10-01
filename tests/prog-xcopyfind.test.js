// 「說已經有了但我找不到」：帶我去看、強制抓、回收桶優先
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

const seed=()=>({savedAt:Date.now(),tab:'items',cur:'A',projects:[
  {id:'A',name:'對業主那份',hideZero:true,taxMode:'excl',signedTotal:0,trash:[],periods:[],blocks:[
    {id:'bA',name:'TYPE-K.1',unit:'間',count:2,items:[
      {id:'i1',no:'6.9',name:'淋浴間壁龕單面壁板',unit:'㎡',qty:2.5,price:280,amount:700},
      // 6.10 還在，但金額 0 被「隱藏 0 元項目」藏起來 → 使用者在明細裡找不到
      {id:'i2',no:'6.10',name:'淋浴間壁龕雙面壁板',unit:'㎡',qty:3,price:0,amount:0},
      // 6.12 還在，但拆成工序收合起來了 → 也找不到
      {id:'i3',no:'6.12',name:'電視牆-骨架',groupId:'g1',groupName:'電視牆',unit:'㎡',qty:15.5,price:150,amount:2325},
      {id:'i4',no:'6.12',name:'電視牆-封板',groupId:'g1',groupName:'電視牆',unit:'㎡',qty:15.5,price:130,amount:2015}]}]},
  {id:'B',name:'代工那份',hideZero:false,taxMode:'excl',signedTotal:0,trash:[],periods:[],blocks:[
    {id:'bB',name:'TYPE-K.1',unit:'間',count:2,items:[
      {id:'j2',no:'6.10',name:'淋浴間壁龕雙面壁板',unit:'㎡',qty:3,price:300,amount:900},
      {id:'j3',no:'6.12',name:'電視牆',unit:'㎡',qty:15.5,price:280,amount:4340},
      {id:'j9',no:'6.20',name:'走道天花封板',unit:'㎡',qty:8,price:260,amount:2080}]}]}]});

(async()=>{
const br=await chromium.launch();
const open=async(st)=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(700);
  pg.on('dialog',async d=>{ await d.accept(); });
  return {pg,errs};
};
const openPanel=async pg=>{
  await pg.evaluate(()=>{ openBlk.add('bA'); render(); }); await pg.waitForTimeout(200);
  await pg.click('[data-xcopy="bA"]'); await pg.waitForTimeout(200);
  await pg.selectOption('[data-xcopyproj="1"]','B'); await pg.waitForTimeout(200);
  await pg.selectOption('[data-xcopyblk="1"]','bB'); await pg.waitForTimeout(250);
};

// ① 0 元被隱藏的那條：要說「已經有了」並講明原因，還要有「帶我去看」
{
  const {pg,errs}=await open(seed()); await openPanel(pg);
  const panel=await pg.textContent('.card[style*="167,139,250"]');
  t('① 認出 6.10 已經有了', /已經有了/.test(panel));
  t('① 講明是被 0 元隱藏藏起來（不是只說有了）', /隱藏 0 元項目/.test(panel));
  t('① 收合的工序那條也講明原因', /收在「電視牆」/.test(panel));
  t('① 每條都有「帶我去看」', await pg.locator('[data-xcfind]').count()>=2);
  t('① 沒有 JS 錯誤', errs.length===0);

  // 按下去 → 自動取消隱藏、捲到那一條並標起來
  await pg.click('[data-xcfind="bA::i2"]'); await pg.waitForTimeout(400);
  t('① 帶我去看會自動取消「隱藏 0 元項目」', await pg.locator('#hide-zero').isChecked()===false);
  t('① 那一條被標起來', await pg.locator('#row-i2.hilite').count()===1);
  const seen=await pg.locator('#row-i2').textContent();
  t('① 真的看得到 6.10 了：'+seen.slice(0,22).replace(/\s+/g,''), /6\.10/.test(seen));
  await pg.close();
}

// ② 收合工序那條：帶我去看要自動展開群組
{
  const {pg}=await open(seed()); await openPanel(pg);
  t('② 一開始工序是收合的（看不到單條）', await pg.locator('#row-i3').count()===0);
  await pg.click('[data-xcfind="bA::i3"]'); await pg.waitForTimeout(400);
  t('② 帶我去看會自動展開工序群組', await pg.locator('#row-i3').count()===1);
  await pg.close();
}

// ③ 預設不給抓重複的，但可以解鎖——不能把人卡死
{
  const {pg}=await open(seed()); await openPanel(pg);
  t('③ 預設只有 1 條可勾（6.20）', await pg.locator('[data-xcpick]').count()===1);
  t('③ 有解鎖按鈕', await pg.locator('[data-xcdup]').count()===1);
  await pg.click('[data-xcdup]'); await pg.waitForTimeout(250);
  t('③ 解鎖後 3 條都可勾', await pg.locator('[data-xcpick]').count()===3);
  const warn=await pg.textContent('.card[style*="167,139,250"]');
  t('③ 並且警告會算兩次', /金額會算兩次/.test(warn));
  // 解鎖後「全選」仍不該把重複的也勾進去
  await pg.click('[data-xcopyall="bA"]'); await pg.waitForTimeout(200);
  t('③ 全選不含重複的（只勾 1 條）', await pg.locator('[data-xcpick]:checked').count()===1);
  await pg.close();
}

// ④ 真的被刪掉的：要指向回收桶，而不是叫人從別的專案抓
{
  const st=seed();
  const A=st.projects[0];
  A.trash=[{id:'t1',at:Date.now(),why:'刪除細項',blkId:'bA',blkName:'TYPE-K.1',blkUnit:'間',blkCount:2,idx:1,
    item:{id:'i2',no:'6.10',name:'淋浴間壁龕雙面壁板',unit:'㎡',qty:3,price:280,amount:840}}];
  A.blocks[0].items=A.blocks[0].items.filter(x=>x.id!=='i2');   // 真的刪掉了
  const {pg}=await open(st); await openPanel(pg);
  const panel=await pg.textContent('.card[style*="167,139,250"]');
  t('④ 認出這條是刪掉過的', /刪掉過/.test(panel));
  t('④ 建議用回收桶復原，不要從別的專案抓', /從回收桶復原/.test(panel)&&/不要從別的專案抓/.test(panel));
  t('④ 面板上就有復原按鈕', await pg.locator('[data-trashrestore="t1"]').count()>=1);
  await pg.click('[data-trashrestore="t1"]'); await pg.waitForTimeout(500);
  const r=await pg.evaluate(()=>{const b=state.projects[0].blocks[0];
    return {ids:b.items.map(x=>x.id),no:(b.items.find(x=>x.id==='i2')||{}).no,
            idx:b.items.findIndex(x=>x.id==='i2'),trash:state.projects[0].trash.length};});
  t('④ 復原後 id 原樣回來（溯源接得回去）', r.ids.includes('i2'));
  t('④ 項次保留 6.10', r.no==='6.10');
  t('④ 放回原本位置（第 2 條）', r.idx===1);
  t('④ 回收桶清掉那一筆', r.trash===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
