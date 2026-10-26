// 進度請款「只看本期有動的」：畫面篩選 ＋ 列印只印本期新增的
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 兩個區塊三期：
//  bA／6.1 第1期做一半、第2期做完（第3期沒動）
//  bA／6.2 第3期才開始做 ← 本期新增
//  bA／6.3 從頭到尾沒動
//  bB／7.1 第3期做一半 ← 本期新增（整個區塊本期才動）
//  bC／8.1 第1期就做完、之後沒動 → 本期這個區塊整個收起來
const seed=()=>({savedAt:Date.now(),tab:'prog',cur:'P',projects:[
  {id:'P',name:'凱子-代工',taxMode:'excl',signedTotal:0,curPeriod:2,blocks:[
    {id:'bA',name:'TYPE-EXS',unit:'間',count:1,items:[
      {id:'i1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:300,amount:3000},
      {id:'i2',no:'6.2',name:'壁龕',unit:'㎡',qty:5,price:280,amount:1400},
      {id:'i3',no:'6.3',name:'電視牆',unit:'㎡',qty:4,price:250,amount:1000}]},
    {id:'bB',name:'TYPE-L',unit:'間',count:1,items:[
      {id:'j1',no:'7.1',name:'走道隔間',unit:'㎡',qty:8,price:300,amount:2400}]},
    {id:'bC',name:'TYPE-S',unit:'間',count:1,items:[
      {id:'k1',no:'8.1',name:'淋浴間壁板',unit:'㎡',qty:3,price:400,amount:1200}]}],
   periods:[
     {no:1,date:'2026-08-31',prog:{i1:{p:0.5},k1:{p:1}}},
     {no:2,date:'2026-09-30',prog:{i1:{p:1},k1:{p:1}}},
     {no:3,date:'2026-10-26',prog:{i1:{p:1},i2:{p:0.4},j1:{p:0.5},k1:{p:1}}}]}]});

(async()=>{
const br=await chromium.launch();
const open=async st=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.evaluate(()=>{ ['bA','bB','bC'].forEach(x=>openBlk.add(x)); render(); });
  await pg.waitForTimeout(400);
  return {pg,errs};
};
// 畫面上看得到哪些項次
const nosOn=async pg=>await pg.evaluate(()=>[...new Set(
  [...document.querySelectorAll('#app table tr')]
    .map(tr=>tr.children[0]&&tr.children[0].textContent.trim())
    .filter(x=>/^\d+\.\d+$/.test(x)))]);

// ① 判斷「本期有動」的邏輯本身
{
  const {pg,errs}=await open(seed());
  const moved=await pg.evaluate(()=>{
    const p=curProj(), c=calc(p,2);
    return c.blocks.map(cb=>({b:cb.blk.id,moved:blkMoved(cb),
      ids:[...movedIdsOf(cb)]}));
  });
  t('① ★ 本期有動的只有 6.2 與 7.1',
    moved[0].ids.sort().join(',')==='i2'&&moved[1].ids.join(',')==='j1');
  t('① 整期沒動的區塊 TYPE-S 判定為沒動',
    moved[0].moved===true&&moved[1].moved===true&&moved[2].moved===false);
  t('① 做完後維持不動的 6.1 不算本期有動', !moved[0].ids.includes('i1'));
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② 畫面：預設全部顯示，勾了只留本期有動的
{
  const {pg,errs}=await open(seed());
  const before=await nosOn(pg);
  t('② 預設五條都看得到', ['6.1','6.2','6.3','7.1','8.1'].every(x=>before.includes(x)));
  t('② 有「只看本期有動的」這個開關', await pg.locator('#only-new').count()===1);
  t('② 開關上寫出有幾條（2 條）', /只看本期有動的（2 條）/.test(await pg.textContent('#app')));

  await pg.click('#only-new'); await pg.waitForTimeout(400);
  const after=await nosOn(pg);
  t('② ★ 勾了只剩 6.2 與 7.1', after.sort().join(',')==='6.2,7.1');
  t('② ★ 本期沒動的 6.1／6.3／8.1 都不見了',
    !after.includes('6.1')&&!after.includes('6.3')&&!after.includes('8.1'));
  const app=await pg.textContent('#app');
  t('② ★ 有講出藏了幾條（顯示 2、隱藏 3）', /顯示 2 條，隱藏 3 條/.test(app));
  t('② ★ 有講出收掉幾個區塊（1 個）', /1 個區塊整個收起來/.test(app));
  t('② ★ 有警告「要填還沒動過的要先關掉」', /要填還沒動過的那幾條，請先關掉/.test(app));
  t('② 金額沒被篩選影響（本次實請照算）',
    /本次實請金額/.test(app)&&await pg.evaluate(()=>calc(curProj(),2).billActual)>0);
  t('② 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ③ 一鍵「顯示全部」
{
  const {pg}=await open(seed());
  await pg.click('#only-new'); await pg.waitForTimeout(400);
  t('③ 篩選狀態有存起來', await pg.evaluate(()=>!!curProj().onlyNew));
  await pg.click('#only-new-off'); await pg.waitForTimeout(400);
  t('③ ★ 按「顯示全部」就全部回來',
    (await nosOn(pg)).sort().join(',')==='6.1,6.2,6.3,7.1,8.1');
  t('③ 旗標也關掉了', await pg.evaluate(()=>!curProj().onlyNew));
  await pg.close();
}

// ④ 列印：三段式選單，「只有本期新增的」第四表只印本期做的
{
  const {pg,errs}=await open(seed());
  await pg.evaluate(()=>printDoc(curProj())); await pg.waitForTimeout(400);
  t('④ 有三段式的「印哪些項目」選單', await pg.locator('#pscope').count()===1);
  t('④ 預設是「做過的」（沿用舊行為）', await pg.inputValue('#pscope')==='done');
  const doneDoc=await pg.innerHTML('.pcontent');
  t('④ 做過的：6.1／6.2／8.1 都印（累計有進度），6.3 不印',
    /6\.1/.test(doneDoc)&&/6\.2/.test(doneDoc)&&/8\.1/.test(doneDoc)&&!/6\.3/.test(doneDoc));

  await pg.selectOption('#pscope','new'); await pg.waitForTimeout(400);
  const newDoc=await pg.innerHTML('.pcontent');
  t('④ ★ 只有本期新增的：第四表只有 6.2 與 7.1',
    /6\.2/.test(newDoc)&&/7\.1/.test(newDoc)&&!/6\.1<\/td>/.test(newDoc)&&!/8\.1/.test(newDoc));
  t('④ ★ 標題寫明是第 3 期新增部分', /本期施作明細（第 3 期新增部分）/.test(newDoc));
  t('④ ★ 有註明數量與金額都是本期增加數（免得業主誤會）',
    /完成數量、％與計價金額均為本期增加數/.test(newDoc));
  t('④ ★ 第一表只列本期有施作的大項（TYPE-S 不列）',
    /僅列本期有施作之大項/.test(newDoc)&&/TYPE-EXS/.test(newDoc)&&/TYPE-L/.test(newDoc)&&!/TYPE-S/.test(newDoc));
  t('④ 有寫出另有幾個大項本期未施作', /另有 1 個大項本期未施作/.test(newDoc));
  t('④ ★ 本次實請金額完全沒變（篩選只影響印哪幾條）',
    (newDoc.match(/本次實請金額/)||[]).length>0
    &&await pg.evaluate(()=>calc(curProj(),2).billActual)===await pg.evaluate(()=>calc(curProj(),2).billActual));

  await pg.selectOption('#pscope','all'); await pg.waitForTimeout(400);
  const allDoc=await pg.innerHTML('.pcontent');
  t('④ 全部項目：連沒動過的 6.3 也印', /6\.3/.test(allDoc)&&/8\.1/.test(allDoc));
  t('④ 選擇有記在專案上', await pg.evaluate(()=>curProj().printScope)==='all');
  t('④ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑤ 拆開的工序：有一道動過，整組都留著（不然看不出這條整體做到哪）
{
  const st=seed();
  const b=st.projects[0].blocks[0];
  b.items=[
    {id:'g1',no:'6.1',name:'雙面隔間-骨架',unit:'㎡',qty:10,price:150,amount:1500,groupId:'G',groupName:'雙面隔間'},
    {id:'g2',no:'6.1',name:'雙面隔間-封板',unit:'㎡',qty:10,price:150,amount:1500,groupId:'G',groupName:'雙面隔間'},
    {id:'i3',no:'6.3',name:'電視牆',unit:'㎡',qty:4,price:250,amount:1000}];
  st.projects[0].periods=[
    {no:1,date:'2026-08-31',prog:{g1:{p:1}}},
    {no:2,date:'2026-10-26',prog:{g1:{p:1},g2:{p:0.5}}}];
  st.projects[0].curPeriod=1;
  const {pg,errs}=await open(st);
  const ids=await pg.evaluate(()=>[...movedIdsOf(calc(curProj(),1).blocks[0])].sort());
  t('⑤ ★ 只有封板動過，骨架也一起留著', ids.join(',')==='g1,g2');
  t('⑤ 沒動過的 6.3 還是不留', !ids.includes('i3'));
  await pg.evaluate(()=>{ curProj().onlyNew=true; openGroup.add('G'); render(); });
  await pg.waitForTimeout(400);
  const app=await pg.textContent('#app');
  t('⑤ 畫面上整組看得到（骨架與封板都在）', /骨架/.test(app)&&/封板/.test(app));
  t('⑤ 6.3 不在畫面上', !/電視牆/.test(app));
  t('⑤ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑥ 往下修正（這期把量改小）也算「本期有動」——不然修正完就看不到了
{
  const st=seed();
  st.projects[0].periods=[
    {no:1,date:'2026-08-31',prog:{i1:{p:1}}},
    {no:2,date:'2026-10-26',prog:{i1:{p:0.6}}}];
  st.projects[0].curPeriod=1;
  const {pg}=await open(st);
  const ids=await pg.evaluate(()=>[...movedIdsOf(calc(curProj(),1).blocks[0])]);
  t('⑥ ★ 往下修正的 6.1 算本期有動', ids.includes('i1'));
  await pg.close();
}

// ⑦ ★ 只印本期新增時，數量／％／金額／小計都要是「本期增加數」，不是累計
//    6.1：合約 10 間 × $300/間（qty 10㎡ × $300 = $3,000/間，共 $30,000）
//    第1期做 4 間（40%）、第2期做到 7 間（70%）→ 本期 3 間、本期計價 $9,000
{
  const st={savedAt:Date.now(),tab:'prog',cur:'P',projects:[
    {id:'P',name:'凱子-代工',taxMode:'excl',signedTotal:0,curPeriod:1,blocks:[
      {id:'bA',name:'TYPE-EXS',unit:'間',count:10,items:[
        {id:'i1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:300,amount:3000}]}],
     periods:[
       {no:1,date:'2026-09-30',prog:{i1:{p:0.4}}},
       {no:2,date:'2026-10-26',prog:{i1:{p:0.7}}}]}]};
  const {pg,errs}=await open(st);
  await pg.evaluate(()=>printDoc(curProj())); await pg.waitForTimeout(400);

  await pg.selectOption('#pscope','done'); await pg.waitForTimeout(300);
  const doneTxt=await pg.textContent('.pcontent');
  t('⑦ 累計模式：欄位是「累計完成計價」、小計 $21,000（7 間）',
    /累計完成計價/.test(doneTxt)&&/\$21,000/.test(doneTxt));

  await pg.selectOption('#pscope','new'); await pg.waitForTimeout(300);
  const newTxt=await pg.textContent('.pcontent');
  t('⑦ ★ 欄位標題改成本期（本期完成間數／本期%／本期計價金額）',
    /本期完成間數/.test(newTxt)&&/本期%/.test(newTxt)&&/本期計價金額/.test(newTxt));
  const sub=await pg.evaluate(()=>{
    const tbs=[...document.querySelectorAll('.pcontent table')];
    const tb=tbs[tbs.length-1];
    const tr=[...tb.querySelectorAll('tr.tot')].pop();
    return [...tr.children].map(td=>td.textContent.trim());
  });
  t('⑦ ★ 第四表小計是本期的 $9,000，不是累計的 $21,000',
    sub[0]==='本期小計'&&sub[1]==='$9,000');
  const cells=await pg.evaluate(()=>{
    const tbs=[...document.querySelectorAll('.pcontent table')];
    const tb=tbs[tbs.length-1];
    const tr=[...tb.querySelectorAll('tr')].find(r=>r.children[0]&&r.children[0].textContent.trim()==='6.1');
    return [...tr.children].map(td=>td.textContent.trim());
  });
  t('⑦ ★ 本期完成間數＝3（10 間裡這期做 3 間）', cells[6]==='3');
  t('⑦ ★ 本期%＝30%（70%−40%）', /^30(\.0)?%$/.test(cells[7]));
  t('⑦ ★ 本期計價金額＝$9,000', cells[8]==='$9,000');
  t('⑦ 合約的數量／單價／總價三欄沒被動到（10／300／3,000 每間）',
    cells[3].startsWith('10')&&cells[4]==='300'&&cells[5]==='3,000');
  t('⑦ ★ 第一表多一欄「本期計價」且金額相同（$9,000）',
    /本期計價/.test(newTxt)&&(newTxt.match(/\$9,000/g)||[]).length>=2);
  t('⑦ ★ 有註明「本次實請金額請以第三表為準」',
    /「本次實請金額」請以第三表為準/.test(newTxt));
  t('⑦ 累計那欄還在（$21,000 仍列在第一表）',
    /累計完成計價/.test(newTxt)&&/21,000/.test(newTxt));
  t('⑦ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
