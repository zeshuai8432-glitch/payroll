// 計量明細照項目編號自然排序（A → A1 → A2 → A10 → A11 → B…），不照輸入日期
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../payroll.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 他那份 TYPE-EXS：A11／A12 是後來補記的（2026-10-26），其餘是 10-04 一次打的。
// 照日期排的話 A11／A12 會跑到最上面，對圖面時整份就亂了。
const REAL=[
  ['A11',0.6,2.7,'2026-10-26'],['A12',0.55,2.7,'2026-10-26'],
  ['A',2.3,3.1],['A1',1.45,3.1],['A2',7.2,3.2],['A3',0.55,2.7],['A4',2.6,2.7],['A5',0.55,2.7],
  ['A6',0.61,3.1],['A7',1.08,3.1],['A8',1.79,3.4],['A9',3.85,3.19],['A10',0.67,2.7],
  ['B',2.23,3.55],['B1',1.32,3.85],['B2',1.0,3.6],['B3',0.45,3.6],['B4',0.35,3.15],['B5',0.57,3.15],['B6',0.5,3.85],
  ['C',1.12,3.15],['C1',1.29,3.15],
  ['D',0.74,3.85],['D1',0.74,3.1],['D2',0.47,3.55],['D3',0.47,3.1],['D4',0.47,3.55],['D5',0.47,3.1],
  ['D6',1.67,3.9],['D7',1.03,3.1],['D8',1.03,3.1],['D9',1.45,3.9]];

const mk=(no,w,h,date,price)=>({id:'x'+no,date:date||'2026-10-04',site:'TYPE-EXS',item:no,unit:'㎡',
  qty:Math.round(w*h*100)/100,unitPrice:price===undefined?null:price,
  measureType:'partition',count:1,width:w,height:h});

(async()=>{
const br=await chromium.launch();
const open=async(items,sortPref)=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await pg.addInitScript(d=>{
    localStorage.setItem('pm_data_v2',JSON.stringify({
      sites:[{id:'s1',name:'TYPE-EXS',active:true}],workers:[],entries:[],
      measurements:d.items,billings:[],loans:[],tools:[],assets:[],ledger:[]}));
    if(d.sort) localStorage.setItem('pm_meas_sort',d.sort);
  },{items,sort:sortPref||''});
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.evaluate(()=>{ state.tab='meas'; render(); }); await pg.waitForTimeout(400);
  return {pg,errs};
};
// 展開案場卡後讀畫面上「項目」欄的實際順序
const screenOrder=async pg=>{
  await pg.click('[data-toggle-form="meas-site-TYPE-EXS"]');
  await pg.waitForTimeout(300);
  return await pg.evaluate(()=>[...document.querySelectorAll('tbody tr')]
    .map(tr=>tr.children.length>=3?tr.children[2].textContent.trim():'')
    .filter(x=>/^[A-Z]\d*$/.test(x)));
};

// ① 預設就照編號排
{
  const {pg,errs}=await open(REAL.map(r=>mk(r[0],r[1],r[2],r[3])));
  const got=await pg.evaluate(()=>[...state.measurements].sort(measListCompare).map(m=>m.item));
  const want=['A','A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12',
    'B','B1','B2','B3','B4','B5','B6','C','C1',
    'D','D1','D2','D3','D4','D5','D6','D7','D8','D9'];
  t('① ★ 預設照編號：A→A1→…→A10→A11→A12→B→…→D9', got.join(',')===want.join(','));
  t('① A2 排在 A10 前面（不是字串比大小）',
    got.indexOf('A2')<got.indexOf('A10'));
  t('① 純字母的 A 排在 A1 前面', got.indexOf('A')===0&&got.indexOf('A1')===1);
  t('① 後來補記的 A11／A12 回到 A10 後面，沒跑到最上面',
    got.indexOf('A10')+1===got.indexOf('A11')&&got.indexOf('A11')+1===got.indexOf('A12'));
  t('① ★ 畫面上的順序也一樣', (await screenOrder(pg)).join(',')===want.join(','));
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② 切到「照日期」就回到舊行為（新的在上）
{
  const {pg,errs}=await open(REAL.map(r=>mk(r[0],r[1],r[2],r[3])),'date');
  const got=await pg.evaluate(()=>[...state.measurements].sort(measListCompare).map(m=>m.item));
  t('② ★ 照日期：10-26 的 A11／A12 在最前面', got[0]==='A11'&&got[1]==='A12');
  t('② 同一天之內還是照編號（A→A1→A2…）',
    got.slice(2,5).join(',')==='A,A1,A2');
  t('② 下拉選單記住了選擇', await pg.inputValue('#meas-sort')==='date');
  t('② 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ③ 從畫面切換排序：存進 localStorage 且立刻重畫
{
  const {pg}=await open(REAL.map(r=>mk(r[0],r[1],r[2],r[3])));
  t('③ 預設選在「照編號」', await pg.inputValue('#meas-sort')==='code');
  await pg.selectOption('#meas-sort','date');
  await pg.waitForTimeout(300);
  t('③ ★ 切成日期後第一筆變 A11',
    await pg.evaluate(()=>[...state.measurements].sort(measListCompare)[0].item)==='A11');
  t('③ 選擇有存起來', await pg.evaluate(()=>localStorage.getItem('pm_meas_sort'))==='date');
  await pg.selectOption('#meas-sort','code');
  await pg.waitForTimeout(300);
  t('③ 切回編號也有效',
    await pg.evaluate(()=>[...state.measurements].sort(measListCompare)[0].item)==='A');
  await pg.close();
}

// ④ 編號後面接說明文字、沒編號的中文項目
{
  const {pg}=await open([
    {id:'z1',date:'2026-10-04',site:'TYPE-EXS',item:'走道天花',unit:'式',qty:3,unitPrice:null,measureType:'partition',count:1},
    mk('A10 走道牆',0.67,2.7),mk('A2 床頭單面隔間',7.2,3.2),mk('A1',1.45,3.1),
    {id:'z2',date:'2026-10-04',site:'TYPE-EXS',item:'搬運',unit:'式',qty:1,unitPrice:null,measureType:'partition',count:1}]);
  const got=await pg.evaluate(()=>[...state.measurements].sort(measListCompare).map(m=>m.item));
  t('④ ★ 編號後面有說明文字也排得對（A1→A2→A10）',
    got.slice(0,3).join('|')==='A1|A2 床頭單面隔間|A10 走道牆');
  t('④ 沒編號的中文項目排最後，彼此照名稱',
    got.slice(3).join(',')==='走道天花,搬運'||got.slice(3).join(',')==='搬運,走道天花');
  t('④ 沒編號的都在有編號的後面',
    got.findIndex(x=>!/^[A-Z]/.test(x))===3);
  await pg.close();
}

// ⑤ 匯出 PDF 也照同一個排序
{
  const {pg}=await open(REAL.map(r=>mk(r[0],r[1],r[2],r[3])));
  const order=await pg.evaluate(()=>{
    let html=''; const real=window.printHTML; window.printHTML=(t,inner)=>{ html=inner; };
    exportMeasurementsPDF(false); window.printHTML=real;
    return [...html.matchAll(/word-break:break-word">([A-Z]\d*)</g)].map(m=>m[1]);
  });
  t('⑤ ★ PDF 也是 A→A1→…→A12→B…',
    order.slice(0,14).join(',')==='A,A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12,B');
  t('⑤ PDF 共 32 筆都在', order.length===32);
  await pg.close();
}

// ⑥ 編號帶小數／破折號（D1-2）不會壞
{
  const {pg,errs}=await open([mk('D1-2',1,1),mk('D1-10',1,1),mk('D1-1',1,1),mk('D2',1,1)]);
  const got=await pg.evaluate(()=>[...state.measurements].sort(measListCompare).map(m=>m.item));
  t('⑥ D1-1 → D1-2 → D1-10 → D2', got.join(',')==='D1-1,D1-2,D1-10,D2');
  t('⑥ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
