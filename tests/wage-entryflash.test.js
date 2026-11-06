// 登記出工：頁面「閃一下、輸入的資料跳回上一個」
// 原因是草稿只在 change 時才同步，而重繪（雲端同步完成、按別的鈕）會照草稿重建欄位
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../payroll.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

const data=()=>({savedAt:Date.now(),tab:'entry',
  employees:[{id:'e1',name:'阿明',active:true,daily:2800},{id:'e2',name:'阿華',active:true,daily:2600}],
  sites:[{id:'s1',name:'凱子',active:true},{id:'s2',name:'TYPE-A',active:true}],
  attendance:[],adjustments:[],loans:[],tools:[],locations:[],assets:[],advances:[],
  accounts:[],ledger:[],deals:[],billings:[],measurements:[],costs:[]});

(async()=>{
const br=await chromium.launch();
const open=async()=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await pg.addInitScript(d=>localStorage.setItem('pm_data_v2',JSON.stringify(d)),data());
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(1100);
  await pg.evaluate(()=>{ state.tab='entry'; render(); window.__r=0;
    const o=window.render; window.render=function(){ window.__r++; return o.apply(this,arguments); }; });
  await pg.waitForTimeout(400);
  return {pg,errs};
};
const type=async(pg,sel,txt)=>{ await pg.click(sel); await pg.keyboard.press('Control+a'); await pg.keyboard.type(txt); };

// ① 依員工·多案場：打字當下草稿就同步（不用等失焦）
{
  const {pg,errs}=await open();
  await pg.selectOption('[data-line-site="0"]','s1');
  await type(pg,'[data-line-hours="0"]','6');
  const d=await pg.evaluate(()=>JSON.parse(JSON.stringify(entryLines)));
  t('① ★ 打完 6 草稿立刻就是 6（以前要失焦才同步，所以中途重繪會跳回 8）',
    d[0].hours==='6'&&d[0].siteId==='s1');
  t('① 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ② ★ 他的 bug：打字中被重繪，值不能跳回上一個
{
  const {pg,errs}=await open();
  await pg.selectOption('[data-line-site="0"]','s1');
  await type(pg,'[data-line-hours="0"]','6');
  await pg.evaluate(()=>render());            // 模擬雲端同步完成直接重繪
  t('② ★ 重繪之後還是 6，不會跳回 8', await pg.inputValue('[data-line-hours="0"]')==='6');
  t('② ★ 案場也還在', await pg.inputValue('[data-line-site="0"]')==='s1');
  t('② ★ 焦點留在同一格（可以接著打）',
    await pg.evaluate(()=>{const e=document.activeElement;return !!(e&&e.dataset&&e.dataset.lineHours==='0');}));
  t('② 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ③ ★ 依案場·多員工：那四格原本完全沒有同步，重繪就全部打回預設
{
  const {pg,errs}=await open();
  await pg.click('#emode-site'); await pg.waitForTimeout(400);
  await pg.selectOption('#es-site','s2');
  await type(pg,'#es-hours','6');
  await type(pg,'#es-ot','2');
  await pg.check('#es-night');
  const st=await pg.evaluate(()=>({site:entrySitePick,h:entrySiteHours,o:entrySiteOt,n:entrySiteNight}));
  t('③ ★ 四格都進草稿了（案場 s2、工時 6、加班 2、過夜 true）',
    st.site==='s2'&&st.h==='6'&&st.o==='2'&&st.n===true);
  await pg.evaluate(()=>render());
  const dom=await pg.evaluate(()=>({site:document.getElementById('es-site').value,
    h:document.getElementById('es-hours').value,
    o:document.getElementById('es-ot').value,
    n:document.getElementById('es-night').checked}));
  t('③ ★ 重繪之後四格都還在（以前會變回 s1／8／0／未勾）',
    dom.site==='s2'&&dom.h==='6'&&dom.o==='2'&&dom.n===true);
  t('③ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ④ 勾員工之後再重繪，工時也不能被打回去（他最可能踩到的順序）
{
  const {pg}=await open();
  await pg.click('#emode-site'); await pg.waitForTimeout(400);
  await type(pg,'#es-hours','9');
  await pg.check('.f-work-only [data-empick="e1"]');
  await pg.check('.f-work-only [data-empick="e2"]');
  await pg.evaluate(()=>render());
  t('④ ★ 工時還是 9，兩個員工也還勾著',
    await pg.inputValue('#es-hours')==='9'
    &&await pg.isChecked('.f-work-only [data-empick="e1"]')
    &&await pg.isChecked('.f-work-only [data-empick="e2"]'));
  await pg.close();
}

// ⑤ 打字中的背景同步要被擋下來，失焦後才補一次（不是兩次）
{
  const {pg}=await open();
  await type(pg,'[data-line-hours="0"]','7');
  const b=await pg.evaluate(()=>window.__r);
  await pg.evaluate(()=>safeRender());
  t('⑤ 打字中 safeRender 不重繪（擋下來）',
    (await pg.evaluate(()=>window.__r))===b&&await pg.evaluate(()=>deferredRender)===true);
  // 真的離開欄位（點空白處瀏覽器會把焦點送到最近的 select，那算「還在操作中」）
  await pg.evaluate(()=>document.activeElement.blur()); await pg.waitForTimeout(500);
  t('⑤ ★ 失焦後補一次（剛好一次，不是兩次）',
    (await pg.evaluate(()=>window.__r))-b===1);
  t('⑤ 值還在', await pg.inputValue('[data-line-hours="0"]')==='7');
  await pg.close();
}

// ⑥ ★ 不會連閃兩下：打字後直接按鈕，只重繪一次
{
  const {pg}=await open();
  await pg.selectOption('[data-line-site="0"]','s1');
  await type(pg,'[data-line-hours="0"]','5');
  await pg.evaluate(()=>safeRender());        // 背景同步被擋，deferredRender=true
  const b=await pg.evaluate(()=>window.__r);
  await pg.click('#f-addline'); await pg.waitForTimeout(500);
  t('⑥ ★ 按「＋再加案場」只重繪一次（以前是兩次，所以會連閃兩下）',
    (await pg.evaluate(()=>window.__r))-b===1);
  t('⑥ 第一列的工時沒被動到', await pg.inputValue('[data-line-hours="0"]')==='5');
  t('⑥ 真的多了一列', await pg.locator('[data-line-hours="1"]').count()===1);
  await pg.close();
}

// ⑦ 登記本身還是正常的（別為了修閃動把功能弄壞）
{
  const {pg,errs}=await open();
  await pg.selectOption('[data-line-site="0"]','s1');
  await type(pg,'[data-line-hours="0"]','8');
  await type(pg,'[data-line-ot="0"]','2');
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.click('#f-add'); await pg.waitForTimeout(700);
  const r=await pg.evaluate(()=>state.attendance.map(a=>({s:a.siteId,h:a.hours,o:a.overtime})));
  t('⑦ ★ 登記成功，工時 8、加班 2 都寫進去了',
    r.length===1&&r[0].s==='s1'&&Number(r[0].h)===8&&Number(r[0].o)===2);
  t('⑦ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

// ⑧ 依案場模式登記多人也正常
{
  const {pg,errs}=await open();
  await pg.click('#emode-site'); await pg.waitForTimeout(400);
  await pg.selectOption('#es-site','s2');
  await type(pg,'#es-hours','7');
  await pg.check('.f-work-only [data-empick="e1"]');
  await pg.check('.f-work-only [data-empick="e2"]');
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.click('#es-add'); await pg.waitForTimeout(700);
  const r=await pg.evaluate(()=>state.attendance.map(a=>({e:a.empId,s:a.siteId,h:a.hours})));
  t('⑧ ★ 兩位員工都登記到 s2、工時 7',
    r.length===2&&r.every(x=>x.s==='s2'&&Number(x.h)===7)
    &&r.map(x=>x.e).sort().join()==='e1,e2');
  t('⑧ 沒有 JS 錯誤', errs.length===0);
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
