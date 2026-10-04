// 從 Excel 貼上：三種分欄、壞行說明，解析完倒進批次表格（還能再改）
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../payroll.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};
const cell=(i,k)=>`[data-mrow="${i}"][data-mkey="${k}"]`;

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
  await pg.evaluate(()=>{ state.tab='meas'; formOpen.meas=true; measBatchOpen=true; measPasteOpen=true; render(); });
  await pg.waitForTimeout(450);
  return {pg,errs};
};

// ① 解析：三種分欄、空行忽略、壞行講原因
{
  const {pg,errs}=await open();
  t('① 貼上區在（收在「從 Excel 貼上」裡）', await pg.locator('#meas-batch').count()===1);
  await pg.fill('#meas-batch',
    'D1 床頭單面隔間, 3.2*2.6+1.1*2.6\n'+
    'D2 走道牆\t4.5*2.6\n'+
    'G 區天花   12.5   式\n'+
    'H 區壁龕, 2.5, ㎡, 280, 圖面編號H\n'+
    '\n'+
    '壞的一行, abc');
  await pg.waitForTimeout(350);
  const pv=await pg.textContent('#meas-batch-preview');
  t('① 解析到 5 行、4 筆可新增、1 行有問題（空行忽略）',
    /解析到 5 行/.test(pv)&&/4 筆可新增/.test(pv)&&/1 行有問題/.test(pv));
  t('① 逗號分欄：3.2*2.6+1.1*2.6 ＝ 11.18', /11\.18/.test(pv));
  t('① Tab 分欄：4.5*2.6 ＝ 11.7', /11\.7/.test(pv));
  t('① 兩個以上空白分欄：12.5 ／ 式', /12\.5/.test(pv)&&/式/.test(pv));
  t('① 沒填單價顯示「—」、有填的顯示金額', /—/.test(pv)&&/\$280/.test(pv));
  t('① 備註帶到', /圖面編號H/.test(pv));
  t('① 壞的一行講明原因與原文', /數量看不懂：abc/.test(pv)&&/壞的一行/.test(pv));
  t('① 沒有 JS 錯誤', errs.length===0);

  // ② 倒進表格：壞行不進去，算式原樣保留可再改
  await pg.click('#meas-batch-add'); await pg.waitForTimeout(600);
  t('② ★ 4 列進表格，壞的那行沒進來',
    await pg.inputValue(cell(0,'item'))==='D1 床頭單面隔間'
    &&await pg.inputValue(cell(3,'item'))==='H 區壁龕'
    &&await pg.evaluate(()=>measRows.filter(r=>/壞的/.test(r.item||'')).length)===0);
  t('② 算式原樣進欄位（不是算完的數字）', await pg.inputValue(cell(0,'qty'))==='3.2*2.6+1.1*2.6');
  t('② 單位：指定的用「式」，沒指定的用預設 ㎡',
    await pg.inputValue(cell(2,'unit'))==='式'&&await pg.inputValue(cell(0,'unit'))==='㎡');
  t('② 單價：有填的帶 280、沒填的留空',
    await pg.inputValue(cell(3,'price'))==='280'&&await pg.inputValue(cell(0,'price'))==='');
  t('② 備註帶到', await pg.inputValue(cell(3,'note'))==='圖面編號H');
  t('② 貼上區自動收起（回到表格繼續改）', await pg.locator('#meas-batch').count()===0);

  // ③ 確認存進去的值
  await pg.selectOption('#meas-site','凱子飯店'); await pg.waitForTimeout(200);
  await pg.click('#meas-rows-save'); await pg.waitForTimeout(650);
  const r=await pg.evaluate(()=>state.measurements.map(m=>({i:m.item,q:m.qty,e:m.qtyExpr||'',u:m.unit,p:m.unitPrice})));
  t('③ ★ 存進 4 筆', r.length===4);
  t('③ 數量與算式都對', r[0].q===11.18&&r[0].e==='3.2*2.6+1.1*2.6'&&r[1].q===11.7);
  t('③ 單價：沒填是 null、有填是 280', r[0].p===null&&r[3].p===280);
  t('③ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ④ 貼上時表格已經有填好的列 → 接在後面，不覆蓋
{
  const {pg}=await open();
  await pg.fill(cell(0,'item'),'手打的那列'); await pg.fill(cell(0,'qty'),'1');
  await pg.waitForTimeout(250);
  await pg.fill('#meas-batch','貼上的 A, 2\n貼上的 B, 3'); await pg.waitForTimeout(300);
  await pg.click('#meas-batch-add'); await pg.waitForTimeout(600);
  const items=await pg.evaluate(()=>measRows.map(r=>r.item));
  t('④ 手打的那列留著、貼上的接在後面：'+items.filter(Boolean).join('／'),
    items[0]==='手打的那列'&&items[1]==='貼上的 A'&&items[2]==='貼上的 B');
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
