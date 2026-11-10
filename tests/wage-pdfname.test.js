// 存成 PDF 的檔名：瀏覽器取的是整個網頁的 <title>，不是列印浮層裡的標題，
// 所以每一份匯出都叫「點工薪資管理系統」。列印前要暫時把 <title> 換掉。
const {chromium}=require('playwright');
const path=require('path');
const WAGE='file://'+path.resolve(__dirname,'../payroll.html');
const PROG='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

// 薪資期間 10/11–11/10，兩位員工
const wageData=()=>({savedAt:Date.now(),tab:'payroll',
  payFrom:'2026-10-11',payTo:'2026-11-10',
  employees:[{id:'e1',name:'吳忠智',active:true,daily:2800},
             {id:'e2',name:'阿華',active:true,daily:2600}],
  sites:[{id:'s1',name:'凱子',active:true}],
  attendance:[{id:'a1',date:'2026-10-20',empId:'e1',siteId:'s1',hours:8,overtime:0,daily:2800},
              {id:'a2',date:'2026-10-21',empId:'e2',siteId:'s1',hours:8,overtime:0,daily:2600}],
  adjustments:[],loans:[],tools:[],locations:[],assets:[],advances:[],
  accounts:[],ledger:[],deals:[],billings:[],measurements:[],costs:[]});
const progData=()=>({savedAt:Date.now(),tab:'prog',cur:'P',projects:[
  {id:'P',name:'凱子-代工',vendor:'東澤',taxMode:'excl',signedTotal:0,curPeriod:0,
   blocks:[{id:'bA',name:'公共區',unit:'式',count:1,items:[
     {id:'a1',no:'A',name:'A 項目',unit:'㎡',qty:100,price:300,amount:30000}]}],
   periods:[{id:'p1',no:5,date:'2026-11-10',prog:{a1:{p:0.5,q:50}}}]}]});

(async()=>{
const br=await chromium.launch();

// ① ★ 他的要求：薪資明細單的檔名＝期末日 + 員工名
{
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  await pg.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await pg.addInitScript(d=>localStorage.setItem('pm_data_v2',JSON.stringify(d)),wageData());
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(WAGE); await pg.waitForTimeout(1100);
  const pageTitle=await pg.title();
  t('① 網頁本來的標題（＝以前每份 PDF 都叫這個）', pageTitle==='點工薪資與案場人事成本管理');

  // 列印當下 <title> 應該被換成檔名
  const seen=await pg.evaluate(()=>{
    let t=null; const o=window.print; window.print=()=>{ t=document.title; };
    exportPayslipPDF('e1');
    document.getElementById('po-print').click();
    window.print=o; return t;
  });
  t('① ★ 檔名是「11-10 吳忠智」（期末日 11/10 ＋ 選的員工）', seen==='11-10 吳忠智');
  t('① ★ 斜線換成 -（檔名不能有 /）', !/\//.test(seen));
  // 真實瀏覽器列印結束會發 afterprint；這裡手動發一次驗還原
  await pg.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  t('① 列印完（afterprint）標題還原，不會卡在檔名上', await pg.title()===pageTitle);

  // 另一位員工 → 另一個檔名
  const seen2=await pg.evaluate(()=>{
    let t=null; const o=window.print; window.print=()=>{ t=document.title; };
    document.getElementById('print-overlay').remove();
    exportPayslipPDF('e2');
    document.getElementById('po-print').click();
    window.print=o; return t;
  });
  t('① ★ 換一個人檔名就不一樣（11-10 阿華）', seen2==='11-10 阿華');
  t('① 沒有 JS 錯誤', errs.length===0);
  await ctx.close();
}

// ② 新分頁那條路（手機用的）檔名也一樣
{
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  await pg.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await pg.addInitScript(d=>localStorage.setItem('pm_data_v2',JSON.stringify(d)),wageData());
  await pg.goto(WAGE); await pg.waitForTimeout(1100);
  await pg.evaluate(()=>exportPayslipPDF('e1')); await pg.waitForTimeout(300);
  const [np]=await Promise.all([ctx.waitForEvent('page'), pg.click('#po-tab')]);
  await np.waitForLoadState('domcontentloaded');
  t('② ★ 新分頁的標題也是「11-10 吳忠智」（手機分享→列印的檔名）',
    (await np.title())==='11-10 吳忠智');
  t('② 內容確實是那個人的明細', /吳忠智/.test(await np.textContent('body')));
  await ctx.close();
}

// ③ 其他匯出也帶日期，不會一堆同名檔
{
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  await pg.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await pg.addInitScript(d=>localStorage.setItem('pm_data_v2',JSON.stringify(d)),wageData());
  await pg.goto(WAGE); await pg.waitForTimeout(1100);
  const seen=await pg.evaluate(()=>{
    let t=null; const o=window.print; window.print=()=>{ t=document.title; };
    exportSummaryPDF();
    document.getElementById('po-print').click();
    window.print=o; return t;
  });
  t('③ 薪資總表檔名帶期末日（11-10 薪資總表）', seen==='11-10 薪資總表');
  await ctx.close();
}

// ④ 檔名裡的危險字元要被換掉（員工名若含 / 或 :）
{
  const d=wageData(); d.employees[0].name='吳忠智/A:B';
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  await pg.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await pg.addInitScript(x=>localStorage.setItem('pm_data_v2',JSON.stringify(x)),d);
  await pg.goto(WAGE); await pg.waitForTimeout(1100);
  const seen=await pg.evaluate(()=>{
    let t=null; const o=window.print; window.print=()=>{ t=document.title; };
    exportPayslipPDF('e1');
    document.getElementById('po-print').click();
    window.print=o; return t;
  });
  t('④ ★ / 與 : 都換成 -（不然存檔會失敗或被截斷）', seen==='11-10 吳忠智-A-B');
  await ctx.close();
}

// ⑤ 進度請款：期別日期 + 廠商 + 第幾期
{
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),progData());
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(PROG); await pg.waitForTimeout(1000);
  pg.on('dialog',async d=>{ await d.accept(); });
  const before=await pg.title();
  await pg.click('#btn-print'); await pg.waitForTimeout(500);
  const seen=await pg.evaluate(()=>{
    let t=null; const o=window.print; window.print=()=>{ t=document.title; };
    document.querySelector('#do-print').click();
    window.print=o; return t;
  });
  t('⑤ ★ 請款單檔名是「11-10 東澤 第5期」', seen==='11-10 東澤 第5期');
  await pg.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  t('⑤ 標題有還原', await pg.title()===before);
  t('⑤ 沒有 JS 錯誤', errs.length===0);
  await ctx.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
