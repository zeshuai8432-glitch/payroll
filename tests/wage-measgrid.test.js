// 計量明細批次輸入：按一下多一列的表格
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../payroll.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

(async()=>{
const br=await chromium.launch();
const open=async()=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await pg.addInitScript(()=>localStorage.setItem('pm_data_v2',JSON.stringify({
    sites:[{id:'s1',name:'凱子飯店',active:true}],workers:[],entries:[],measurements:[],
    billings:[],loans:[],tools:[],assets:[],ledger:[]})));
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.evaluate(()=>{ state.tab='meas'; formOpen.meas=true; measBatchOpen=true; render(); });
  await pg.waitForTimeout(450);
  return {pg,errs};
};
const cell=(i,k)=>`[data-mrow="${i}"][data-mkey="${k}"]`;

// ① 表格長出來、欄位齊、按一下多一條
{
  const {pg,errs}=await open();
  const th=await pg.evaluate(()=>[...document.querySelectorAll('#meas-rows th')].map(x=>x.textContent.trim()));
  t('① 欄位就是你要的那幾個：'+th.filter(Boolean).join('／'),
    th.join(',').includes('項目')&&th.join(',').includes('單位')&&th.join(',').includes('間數')
    &&th.join(',').includes('數量/面積')&&th.join(',').includes('單價')&&th.join(',').includes('小計')
    &&th.join(',').includes('日期')&&th.join(',').includes('備註'));
  t('① 預設先給 3 列', await pg.locator(cell(0,'item')).count()===1&&await pg.locator(cell(2,'item')).count()===1);
  t('① 單位預設帶 ㎡', await pg.inputValue(cell(0,'unit'))==='㎡');
  t('① 日期預設帶今天', (await pg.inputValue(cell(0,'date')))!=='');

  await pg.selectOption('#meas-site','凱子飯店'); await pg.waitForTimeout(200);
  await pg.click('#meas-row-add'); await pg.waitForTimeout(350);
  t('② ★ 按「＋ 多一條」真的多一列', await pg.locator(cell(3,'item')).count()===1);
  t('② ★ 案場選好之後不會被重繪清掉', await pg.inputValue('#meas-site')==='凱子飯店');
  await pg.click('#meas-row-add'); await pg.click('#meas-row-add'); await pg.waitForTimeout(400);
  t('② 連按幾次也還在', await pg.inputValue('#meas-site')==='凱子飯店'
    &&await pg.locator(cell(5,'item')).count()===1);
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ③ 打字即時算小計，而且不會把游標踢掉
{
  const {pg,errs}=await open();
  await pg.fill(cell(0,'item'),'D1 床頭單面隔間');
  await pg.fill(cell(0,'qty'),'3.2*2.6+1.1*2.6'); await pg.waitForTimeout(250);
  t('③ 算式即時算出來（11.18）', /＝ 11\.18/.test(await pg.textContent('[data-mcalc="0"]')));
  t('③ 沒填單價時小計顯示「—」', (await pg.textContent('[data-mamt="0"]')).trim()==='—');
  await pg.fill(cell(0,'price'),'280'); await pg.waitForTimeout(250);
  t('③ ★ 填了單價小計就算出來（11.18 × 280 ＝ 3,130）',
    /3,130/.test(await pg.textContent('[data-mamt="0"]')));
  await pg.fill(cell(0,'count'),'5'); await pg.waitForTimeout(250);
  t('③ 間數 5：數量變 55.9、小計 15,652', /＝ 55\.9/.test(await pg.textContent('[data-mcalc="0"]'))
    &&/15,652/.test(await pg.textContent('[data-mamt="0"]')));
  // 游標還在原處（沒有整頁重繪）
  await pg.focus(cell(0,'item'));
  await pg.fill(cell(1,'qty'),'4.5'); await pg.waitForTimeout(200);
  t('③ ★ 改別列不會把表格重繪掉（第 0 列的值還在）',
    await pg.inputValue(cell(0,'qty'))==='3.2*2.6+1.1*2.6');
  t('③ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ④ 全部新增
{
  const {pg,errs}=await open();
  await pg.selectOption('#meas-site','凱子飯店');
  await pg.fill(cell(0,'item'),'D1 床頭單面隔間'); await pg.fill(cell(0,'qty'),'3.2*2.6');
  await pg.fill(cell(1,'item'),'G 區天花'); await pg.fill(cell(1,'qty'),'12.5');
  await pg.fill(cell(1,'unit'),'式'); await pg.fill(cell(1,'price'),'1500');
  await pg.fill(cell(1,'note'),'圖面編號G');
  await pg.fill(cell(2,'item'),'壞的'); await pg.fill(cell(2,'qty'),'abc');
  await pg.waitForTimeout(300);
  t('④ 壞的那列標出錯誤', /看不懂/.test(await pg.textContent('[data-mamt="2"]')));
  const foot=await pg.textContent('#meas-rows-stat');
  t('④ 下方統計跟著打字更新：'+foot.trim().replace(/\s+/g,' '),
    /2 筆可新增/.test(foot)&&/1 列有問題/.test(foot));

  await pg.click('#meas-rows-save'); await pg.waitForTimeout(650);
  const r=await pg.evaluate(()=>state.measurements.map(m=>({i:m.item,q:m.qty,e:m.qtyExpr||'',
    u:m.unit,p:m.unitPrice,n:m.note||'',s:m.site,man:!!m.qtyManual})));
  t('⑤ ★ 只新增 2 筆（壞的跳過）', r.length===2);
  t('⑤ 第 1 筆：算式留著、單價 null', r[0].q===8.32&&r[0].e==='3.2*2.6'&&r[0].p===null);
  t('⑤ 第 2 筆：單位式、單價 1500、備註帶到', r[1].u==='式'&&r[1].p===1500&&r[1].n==='圖面編號G');
  t('⑤ 案場整批共用', r.every(x=>x.s==='凱子飯店'));
  t('⑤ 都標成手動輸入', r.every(x=>x.man));
  t('⑤ 新增後表格清空（重新給 3 列空白）',
    await pg.inputValue(cell(0,'item'))===''&&await pg.locator(cell(2,'item')).count()===1);
  t('⑤ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑥ 刪某一列、沒選案場要擋
{
  const {pg}=await open();
  await pg.fill(cell(0,'item'),'A'); await pg.fill(cell(0,'qty'),'1');
  await pg.fill(cell(1,'item'),'B'); await pg.fill(cell(1,'qty'),'2');
  await pg.waitForTimeout(250);
  await pg.click('[data-mdel="0"]'); await pg.waitForTimeout(350);
  t('⑥ 刪掉第 1 列，B 補上來', await pg.inputValue(cell(0,'item'))==='B');

  let msg=''; pg.removeAllListeners('dialog');
  pg.on('dialog',async d=>{ msg=d.message(); await d.dismiss(); });
  await pg.click('#meas-rows-save'); await pg.waitForTimeout(400);
  t('⑥ 沒選案場會擋並說明整批共用', /請先在上面選案場/.test(msg)&&/整批共用/.test(msg));
  t('⑥ 一筆都沒進去', await pg.evaluate(()=>state.measurements.length)===0);
  await pg.close();
}

// ⑦ 從 Excel 貼上 → 倒進表格還能再改
{
  const {pg,errs}=await open();
  await pg.selectOption('#meas-site','凱子飯店');
  await pg.click('#meas-paste-toggle'); await pg.waitForTimeout(350);
  await pg.fill('#meas-batch','D1 牆, 3*2.6\nD2 牆\t4*2.6'); await pg.waitForTimeout(300);
  await pg.click('#meas-batch-add'); await pg.waitForTimeout(600);
  t('⑦ ★ 貼上的變成表格的列', await pg.inputValue(cell(0,'item'))==='D1 牆'
    &&await pg.inputValue(cell(1,'item'))==='D2 牆');
  t('⑦ 算式原樣帶進欄位（還能再改）', await pg.inputValue(cell(0,'qty'))==='3*2.6');
  await pg.fill(cell(0,'qty'),'3*2.6+0.5*2.6'); await pg.waitForTimeout(250);
  t('⑦ 改了之後小計跟著算（9.1）', /＝ 9\.1/.test(await pg.textContent('[data-mcalc="0"]')));
  await pg.click('#meas-rows-save'); await pg.waitForTimeout(650);
  const r=await pg.evaluate(()=>state.measurements.map(m=>({i:m.item,q:m.qty,e:m.qtyExpr})));
  t('⑦ 存進去是改過的值（9.1）', r.length===2&&r[0].q===9.1&&r[0].e==='3*2.6+0.5*2.6');
  t('⑦ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
