// 計量明細批次輸入：一行一筆
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

// ① 解析與預覽
{
  const {pg,errs}=await open();
  t('① 有批次輸入區', await pg.locator('#meas-batch').count()===1);
  await pg.selectOption('#meas-site','凱子飯店');
  await pg.fill('#meas-batch',
    'D1 床頭單面隔間, 3.2*2.6+1.1*2.6\n'+
    'D2 走道牆\t4.5*2.6\n'+          // Tab 分欄
    'G 區天花   12.5   式\n'+        // 兩個以上空白 ＋ 單位
    'H 區壁龕, 2.5, ㎡, 280, 圖面編號H\n'+
    '\n'+                             // 空行要忽略
    '壞的一行, abc');
  await pg.waitForTimeout(350);
  const pv=await pg.textContent('#meas-batch-preview');
  t('① 解析到 5 行、4 筆可新增、1 行有問題', /解析到 5 行/.test(pv)&&/4 筆可新增/.test(pv)&&/1 行有問題/.test(pv));
  t('① 算式算出來了（3.2*2.6+1.1*2.6 ＝ 11.18）', /11\.18/.test(pv));
  t('① Tab 分欄認得（4.5*2.6 ＝ 11.7）', /11\.7/.test(pv));
  t('① 兩個空白分欄認得（12.5 ／ 式）', /12\.5/.test(pv)&&/式/.test(pv));
  t('① 沒填單價顯示「—」，有填的顯示金額', /—/.test(pv)&&/\$280/.test(pv));
  t('① 備註帶進去', /圖面編號H/.test(pv));
  t('① 壞的一行講明原因', /數量看不懂：abc/.test(pv));
  t('① 沒有 JS 錯誤', errs.length===0);

  await pg.click('#meas-batch-add'); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>state.measurements.map(m=>({i:m.item,q:m.qty,e:m.qtyExpr||'',
    u:m.unit,p:m.unitPrice,n:m.note||'',s:m.site,man:!!m.qtyManual})));
  t('② ★ 只新增 4 筆（壞的那行跳過）', r.length===4);
  t('② 項目、數量、算式都對',
    r[0].i==='D1 床頭單面隔間'&&r[0].q===11.18&&r[0].e==='3.2*2.6+1.1*2.6');
  t('② 單位：沒指定的用表單預設 ㎡，指定的用「式」', r[0].u==='㎡'&&r[2].u==='式');
  t('② 單價：沒填的是 null，有填的是 280', r[0].p===null&&r[3].p===280);
  t('② 備註帶進去', r[3].n==='圖面編號H');
  t('② 案場整批共用', r.every(x=>x.s==='凱子飯店'));
  t('② 都標成手動輸入（不會被寬高自動算蓋掉）', r.every(x=>x.man));
  t('② 新增後輸入框清空', await pg.inputValue('#meas-batch')==='');
  await pg.close();
}

// ③ 間數會乘進去
{
  const {pg}=await open();
  await pg.selectOption('#meas-site','凱子飯店');
  await pg.fill('#meas-count','5'); await pg.waitForTimeout(200);
  await pg.fill('#meas-batch','標準房隔間, 3*2.6'); await pg.waitForTimeout(350);
  const pv=await pg.textContent('#meas-batch-preview');
  t('③ 預覽就先把間數乘進去（7.8 × 5 ＝ 39）', /39/.test(pv)&&/間數 5/.test(pv));
  await pg.click('#meas-batch-add'); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>state.measurements.map(m=>({q:m.qty,per:m.perQty,c:m.count})));
  t('③ 存的是總數量 39、每間 7.8、間數 5', r[0].q===39&&r[0].per===7.8&&r[0].c===5);
  await pg.close();
}

// ④ 沒選案場要擋下來
{
  const {pg}=await open();
  let msg=''; pg.removeAllListeners('dialog');
  pg.on('dialog',async d=>{ msg=d.message(); await d.dismiss(); });
  await pg.fill('#meas-batch','測試, 1'); await pg.waitForTimeout(300);
  await pg.click('#meas-batch-add'); await pg.waitForTimeout(400);
  t('④ 沒選案場會擋下來並說明', /先在上面選好日期與案場/.test(msg));
  t('④ 一筆都沒進去', await pg.evaluate(()=>state.measurements.length)===0);
  await pg.close();
}

// ⑤ 案場也能用手動輸入
{
  const {pg}=await open();
  await pg.selectOption('#meas-site','__manual__'); await pg.waitForTimeout(250);
  await pg.fill('#meas-site-manual','東澤新案 7F');
  await pg.fill('#meas-batch','A 牆, 2*2.6\nB 牆, 3*2.6'); await pg.waitForTimeout(350);
  await pg.click('#meas-batch-add'); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>state.measurements.map(m=>m.site));
  t('⑤ 手動案場整批共用', r.length===2&&r.every(x=>x==='東澤新案 7F'));
  await pg.close();
}

// ⑥ 收起批次輸入不會誤刪已存的資料
{
  const {pg}=await open();
  await pg.selectOption('#meas-site','凱子飯店');
  await pg.fill('#meas-batch','A 牆, 2*2.6'); await pg.waitForTimeout(300);
  await pg.click('#meas-batch-add'); await pg.waitForTimeout(600);
  await pg.click('#meas-batch-toggle'); await pg.waitForTimeout(400);
  t('⑥ 收起後資料還在', await pg.evaluate(()=>state.measurements.length)===1);
  t('⑥ 批次區收起來了', await pg.locator('#meas-batch').count()===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
