// 計量明細拿來整理給廠商對圖面：單價可留空、案場可手動輸入、數量可填算式
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
    sites:[{id:'s1',name:'凱子飯店',active:true},{id:'s2',name:'廣昕辦公室',active:true}],
    workers:[],entries:[],measurements:[],billings:[],loans:[],tools:[],assets:[],ledger:[]})));
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  pg.on('dialog',async d=>{ await d.accept(); });
  return {pg,errs};
};
const openForm=async pg=>{
  await pg.evaluate(()=>{ state.tab='meas'; formOpen.meas=true; render(); });
  await pg.waitForTimeout(400);
};
// 案場卡預設收合，列不會渲染——要看列就得先展開
const expandAll=async pg=>{
  await pg.evaluate(()=>{
    state.measurements.forEach(m=>{ formOpen['meas-site-'+parentSiteName(m.site)]=true; });
    render();
  });
  await pg.waitForTimeout(400);
};

// ① 單價留空也能新增
{
  const {pg,errs}=await open(); await openForm(pg);
  await pg.selectOption('#meas-site','凱子飯店');
  await pg.fill('#meas-item','D1 床頭單面隔間');
  await pg.fill('#meas-width','3.2'); await pg.fill('#meas-height','2.6');
  await pg.waitForTimeout(200);
  t('① 寬高自動算面積 8.32', await pg.inputValue('#meas-qty')==='8.32');
  t('① 單價留空時小計顯示「—」，不是 $0', (await pg.textContent('#meas-subtotal')).trim()==='—');
  await pg.click('#meas-add'); await pg.waitForTimeout(500);
  await expandAll(pg);
  const r=await pg.evaluate(()=>state.measurements.map(m=>({s:m.site,i:m.item,q:m.qty,p:m.unitPrice})));
  t('① ★ 沒填單價也存得進去', r.length===1&&r[0].q===8.32);
  t('① 單價存成 null（不是 0）', r[0].p===null);
  t('① 沒有 JS 錯誤', errs.length===0);

  // 直接讀那一列的儲存格，不要掃整頁（整頁別處也有「—」和 $0）
  const cells=await pg.evaluate(()=>{
    const tr=[...document.querySelectorAll('tr')].find(r=>/D1 床頭單面隔間/.test(r.textContent));
    return tr?[...tr.querySelectorAll('td')].map(td=>td.textContent.trim()):null;
  });
  t('② 列表那一列抓得到：'+(cells?cells.slice(0,8).join(' | '):'(沒找到)'), !!cells);
  t('② ★ 單價與小計兩格都是「—」，不是 $0',
    !!cells&&cells.filter(c=>c==='—').length>=2&&!cells.some(c=>c==='$0'));
  await pg.close();
}

// ③ 案場可以手動輸入（不在清單裡的也存得進去，而且自己歸一組）
{
  const {pg,errs}=await open(); await openForm(pg);
  t('③ 下拉有「手動輸入」選項', (await pg.textContent('#meas-site')).includes('手動輸入'));
  t('③ 手動欄位預設隱藏', !(await pg.locator('#meas-site-manual').isVisible()));
  await pg.selectOption('#meas-site','__manual__'); await pg.waitForTimeout(250);
  t('③ 選了之後才出現', await pg.locator('#meas-site-manual').isVisible());
  await pg.fill('#meas-site-manual','東澤新案 7F');
  await pg.fill('#meas-item','G 區天花');
  await pg.fill('#meas-unit','式'); await pg.waitForTimeout(150);
  await pg.fill('#meas-qty','3');
  await pg.click('#meas-add'); await pg.waitForTimeout(500);
  const r=await pg.evaluate(()=>state.measurements.map(m=>m.site));
  t('③ ★ 手動打的案場存進去了', r[0]==='東澤新案 7F');
  t('③ 列表把它歸成自己一組（不是「未填案場」）',
    await pg.evaluate(()=>parentSiteName(state.measurements[0].site))==='東澤新案 7F');
  t('③ 沒有 JS 錯誤', errs.length===0);

  // 下次開表單會記住，而且自動停在手動模式
  await openForm(pg);
  t('④ 再開表單仍停在手動模式並帶回原值',
    await pg.inputValue('#meas-site')==='__manual__'&&await pg.inputValue('#meas-site-manual')==='東澤新案 7F');
  await pg.close();
}

// ⑤ 數量可以填算式，而且算式留著給廠商對
{
  const {pg,errs}=await open(); await openForm(pg);
  await pg.selectOption('#meas-site','凱子飯店');
  await pg.fill('#meas-item','D/F 區 走道牆');
  await pg.click('#meas-qty-manual'); await pg.waitForTimeout(250);   // 切手動輸入
  await pg.fill('#meas-qty','3.2*2.6+1.1*2.6'); await pg.waitForTimeout(250);
  t('⑤ 旁邊即時算出來給你看', /＝ 11\.18/.test(await pg.textContent('#meas-qty-hint')));
  await pg.click('#meas-add'); await pg.waitForTimeout(500);
  const r=await pg.evaluate(()=>state.measurements.map(m=>({q:m.qty,e:m.qtyExpr||'',man:!!m.qtyManual})));
  t('⑤ ★ 算式算對（3.2*2.6+1.1*2.6 ＝ 11.18）', r[0].q===11.18);
  t('⑤ ★ 算式留著', r[0].e==='3.2*2.6+1.1*2.6');
  t('⑤ 記著這筆是手動輸入的', r[0].man===true);
  await expandAll(pg);
  const body=await pg.textContent('body');
  t('⑤ 列表上看得到算式', /=3\.2\*2\.6\+1\.1\*2\.6/.test(body.replace(/\s+/g,'')));
  t('⑤ 沒有 JS 錯誤', errs.length===0);

  // 改這一筆：算式要帶回輸入框，而且可以改
  await pg.evaluate(()=>{ measEditId=state.measurements[0].id;
    formOpen['meas-site-'+parentSiteName(state.measurements[0].site)]=true; render(); });
  await pg.waitForTimeout(400);
  t('⑥ 編輯時算式帶回輸入框', await pg.inputValue('#me-qty')==='3.2*2.6+1.1*2.6');
  t('⑥ 單價欄是空的（原本沒填）', await pg.inputValue('#me-price')==='');
  await pg.fill('#me-qty','3.2*2.6');
  await pg.click('#meas-edit-ok'); await pg.waitForTimeout(500);
  const r2=await pg.evaluate(()=>state.measurements.map(m=>({q:m.qty,e:m.qtyExpr||'',p:m.unitPrice})));
  t('⑥ 改算式後數量跟著變（8.32）', r2[0].q===8.32&&r2[0].e==='3.2*2.6');
  t('⑥ 單價留空儲存後仍是 null', r2[0].p===null);
  await pg.close();
}

// ⑦ 單價亂打要擋下來，不能默默變 0
{
  const {pg}=await open(); await openForm(pg);
  let msg='';
  pg.removeAllListeners('dialog');
  pg.on('dialog',async d=>{ msg=d.message(); await d.dismiss(); });
  await pg.selectOption('#meas-site','凱子飯店');
  await pg.fill('#meas-item','測試'); await pg.fill('#meas-unit','式'); await pg.waitForTimeout(150);
  await pg.fill('#meas-qty','1'); await pg.fill('#meas-price','abc');
  await pg.click('#meas-add'); await pg.waitForTimeout(400);
  t('⑦ 單價看不懂會擋下來並說可以留空', /單價看不懂/.test(msg)&&/留空/.test(msg));
  t('⑦ 沒有存進去', await pg.evaluate(()=>state.measurements.length)===0);
  await pg.close();
}

// ⑧ ★ 編輯既有的一筆也要能改案場（原本編輯表單完全沒有這個欄位）
{
  const {pg,errs}=await open();
  await pg.evaluate(()=>{
    state.measurements=[{id:'m1',date:'2026-10-01',site:'凱子飯店',item:'D1 隔間',unit:'㎡',
      qty:8.32,unitPrice:null,measureType:'partition',count:1,width:3.2,height:2.6}];
    state.tab='meas'; formOpen['meas-site-凱子飯店']=true; measEditId='m1'; render();
  }); await pg.waitForTimeout(500);
  t('⑧ ★ 編輯表單有案場欄位', await pg.locator('#me-site').count()===1);
  t('⑧ 帶出原本的案場', await pg.inputValue('#me-site')==='凱子飯店');
  t('⑧ 下拉也有手動輸入選項', (await pg.textContent('#me-site')).includes('手動輸入'));
  t('⑧ 手動欄位預設隱藏', !(await pg.locator('#me-site-manual').isVisible()));

  await pg.selectOption('#me-site','__manual__'); await pg.waitForTimeout(300);
  t('⑨ 選了手動才出現（新增表單是收合的，這裡仍要能切）',
    await pg.locator('#me-site-manual').isVisible());
  await pg.fill('#me-site-manual','廣昕 B1');
  await pg.click('#meas-edit-ok'); await pg.waitForTimeout(500);
  const r=await pg.evaluate(()=>({site:state.measurements[0].site,q:state.measurements[0].qty,
    p:state.measurements[0].unitPrice,grp:parentSiteName(state.measurements[0].site)}));
  t('⑨ ★ 案場改成手動打的值', r.site==='廣昕 B1');
  t('⑨ 歸到新的案場組', r.grp==='廣昕 B1');
  t('⑨ 數量與單價沒被動到（8.32／留空）', r.q===8.32&&r.p===null);
  t('⑨ 沒有 JS 錯誤', errs.length===0);

  // 再改回現成案場
  await pg.evaluate(()=>{ formOpen['meas-site-廣昕 B1']=true; measEditId='m1'; render(); });
  await pg.waitForTimeout(450);
  t('⑩ 原本是手動的，重開編輯時自動停在手動模式並帶回原值',
    await pg.inputValue('#me-site')==='__manual__'&&await pg.inputValue('#me-site-manual')==='廣昕 B1');
  await pg.selectOption('#me-site','凱子飯店'); await pg.waitForTimeout(250);
  await pg.click('#meas-edit-ok'); await pg.waitForTimeout(500);
  t('⑩ 改回現成案場也可以', await pg.evaluate(()=>state.measurements[0].site)==='凱子飯店');
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
