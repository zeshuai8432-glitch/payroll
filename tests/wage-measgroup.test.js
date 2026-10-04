// 照項目編號開頭（A／B／C…）分組算總和
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../payroll.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 他那份 TYPE-EXS 的真實資料：A 11 筆 70.09／B 7 筆 23.05／C 2 筆 7.59／D 10 筆 29.94
const REAL=[
  ['A',2.3,3.1],['A1',1.45,3.1],['A2',7.2,3.2],['A3',0.55,2.7],['A4',2.6,2.7],['A5',0.55,2.7],
  ['A6',0.61,3.1],['A7',1.08,3.1],['A8',1.79,3.4],['A9',3.85,3.19],['A10',0.67,2.7],
  ['B',2.23,3.55],['B1',1.32,3.85],['B2',1.0,3.6],['B3',0.45,3.6],['B4',0.35,3.15],['B5',0.57,3.15],['B6',0.5,3.85],
  ['C',1.12,3.15],['C1',1.29,3.15],
  ['D',0.74,3.85],['D1',0.74,3.1],['D2',0.47,3.55],['D3',0.47,3.1],['D4',0.47,3.55],['D5',0.47,3.1],
  ['D6',1.67,3.9],['D7',1.03,3.1],['D8',1.03,3.1],['D9',1.45,3.9]];

(async()=>{
const br=await chromium.launch();
const open=async(items)=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await pg.addInitScript(d=>localStorage.setItem('pm_data_v2',JSON.stringify({
    sites:[{id:'s1',name:'TYPE-EXS',active:true}],workers:[],entries:[],
    measurements:d,billings:[],loans:[],tools:[],assets:[],ledger:[]})),items);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.evaluate(()=>{ state.tab='meas'; render(); }); await pg.waitForTimeout(400);
  return {pg,errs};
};
const mk=(no,w,h,price)=>({id:'x'+no,date:'2026-10-04',site:'TYPE-EXS',item:no,unit:'㎡',
  qty:Math.round(w*h*100)/100,unitPrice:price===undefined?null:price,
  measureType:'partition',count:1,width:w,height:h});

// ① 畫面上的小計條
{
  const {pg,errs}=await open(REAL.map(([n,w,h])=>mk(n,w,h)));
  const sum=await pg.evaluate(()=>measPrefixSummary(state.measurements)
    .map(e=>({k:e.key,n:e.n,q:e.units['㎡']})));
  t('① 分成 A／B／C／D 四組', sum.map(x=>x.k).join(',')==='A,B,C,D');
  t('① ★ A：11 筆 70.09 ㎡', sum[0].n===11&&Math.abs(sum[0].q-70.09)<0.02);
  t('① ★ B：7 筆 23.05 ㎡', sum[1].n===7&&Math.abs(sum[1].q-23.05)<0.02);
  t('① ★ C：2 筆 7.59 ㎡', sum[2].n===2&&Math.abs(sum[2].q-7.59)<0.02);
  t('① ★ D：10 筆 29.94 ㎡', sum[3].n===10&&Math.abs(sum[3].q-29.94)<0.02);

  // 只讀那個小計條本身——textContent('body') 會把 <script> 原始碼也算進去
  const strip=await pg.textContent('[data-measprefix]');
  t('② 卡片上就看得到（收合狀態也在）',
    /照編號開頭分組/.test(strip)&&/70\.09/.test(strip)&&/11 筆/.test(strip));
  t('② 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ③ A10 不會被當成 A1（編號要整段抓）
{
  const {pg}=await open([mk('A1',1,1),mk('A10',2,1),mk('AB1',3,1)]);
  const sum=await pg.evaluate(()=>measPrefixSummary(state.measurements).map(e=>({k:e.key,n:e.n})));
  t('③ A1 與 A10 同一組（A），AB1 另一組（AB）',
    sum.length===2&&sum[0].k==='A'&&sum[0].n===2&&sum[1].k==='AB'&&sum[1].n===1);
  await pg.close();
}

// ④ 只有一組時不顯示小計條（沒意義）
{
  const {pg}=await open([mk('A1',1,1),mk('A2',2,1)]);
  t('④ 只有一組就不顯示小計條', await pg.locator('[data-measprefix]').count()===0);
  await pg.close();
}

// ⑤ 開頭不是字母的（中文項目）不計入分組
{
  const {pg}=await open([mk('A1',1,1),mk('B1',2,1),
    {id:'z',date:'2026-10-04',site:'TYPE-EXS',item:'走道天花',unit:'式',qty:3,unitPrice:null,measureType:'ceiling',count:1}]);
  const sum=await pg.evaluate(()=>measPrefixSummary(state.measurements).map(e=>e.key));
  t('⑤ 中文開頭的不列入（只有 A／B）', sum.join(',')==='A,B');
  await pg.close();
}

// ⑥ 單位不同不可以亂加
{
  const {pg}=await open([mk('A1',1,1),
    {id:'a2',date:'2026-10-04',site:'TYPE-EXS',item:'A2 補強',unit:'式',qty:2,unitPrice:null,measureType:'partition',count:1},
    mk('B1',2,1)]);
  const a=await pg.evaluate(()=>measPrefixSummary(state.measurements)[0]);
  t('⑥ ★ 同一組裡不同單位分開列（1 ㎡ ＋ 2 式）',
    a.units['㎡']===1&&a.units['式']===2);
  t('⑥ 畫面上寫成「1 ㎡ ＋ 2 式」', /1 ㎡ ＋ 2 式/.test(await pg.textContent('[data-measprefix]')));
  await pg.close();
}

// ⑦ 有單價時小計也帶金額；匯出 PDF 也要有這張表
{
  const {pg,errs}=await open([mk('A1',2,2,100),mk('A2',3,2,100),mk('B1',1,2,200)]);
  t('⑦ 有單價時小計帶金額（A：4+6=10 ㎡ × 100 ＝ $1,000）',
    /\$1,000/.test(await pg.textContent('[data-measprefix]')));
  const doc=await pg.evaluate(()=>{
    let html=''; const real=window.printHTML; window.printHTML=(t,inner)=>{ html=inner; };
    exportMeasurementsPDF(false); window.printHTML=real; return html;
  });
  t('⑦ ★ PDF 有「編號／筆數／數量合計」小計表',
    /<th>編號<\/th>/.test(doc)&&/筆數/.test(doc)&&/數量合計/.test(doc));
  t('⑦ PDF 小計數字對（A 10 ㎡、B 2 ㎡）', /10 ㎡/.test(doc)&&/2 ㎡/.test(doc));
  t('⑦ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑧ 整份沒單價時，PDF 小計表不要有金額欄
{
  const {pg}=await open([mk('A1',2,2),mk('B1',1,2)]);
  const doc=await pg.evaluate(()=>{
    let html=''; const real=window.printHTML; window.printHTML=(t,inner)=>{ html=inner; };
    exportMeasurementsPDF(false); window.printHTML=real; return html;
  });
  t('⑧ 小計表在', /<th>編號<\/th>/.test(doc));
  t('⑧ ★ 但沒有金額欄', !/<th class="num">金額<\/th>/.test(doc));
  t('⑧ 也沒有營業稅', !/營業稅/.test(doc));
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
