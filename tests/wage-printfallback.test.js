// 手機按「列印 / 存成 PDF」沒反應：iOS 加到主畫面（standalone）與 LINE／FB 內建瀏覽器裡
// window.print() 是靜默無效的。多給一條「↗ 在瀏覽器開啟」，用分享→列印存 PDF。
const {chromium}=require('playwright');
const path=require('path');
const WAGE='file://'+path.resolve(__dirname,'../payroll.html');
const PROG='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

const wageData=()=>({savedAt:Date.now(),tab:'meas',employees:[],
  sites:[{id:'s1',name:'凱子',active:true}],
  attendance:[],adjustments:[],loans:[],tools:[],locations:[],assets:[],advances:[],
  accounts:[],ledger:[],deals:[],billings:[],costs:[],
  measurements:[{id:'m1',date:'2026-11-01',site:'凱子',item:'A1',unit:'㎡',qty:10,
    unitPrice:300,measureType:'partition',count:1,width:2,height:5}]});
const progData=()=>({savedAt:Date.now(),tab:'prog',cur:'P',projects:[
  {id:'P',name:'凱子-代工',vendor:'甲',taxMode:'excl',signedTotal:0,curPeriod:0,withholdPct:3,
   blocks:[{id:'bA',name:'公共區',unit:'式',count:1,items:[
     {id:'a1',no:'A',name:'A 項目',unit:'㎡',qty:100,price:300,amount:30000}]}],
   periods:[{id:'p1',no:1,date:'2026-11-01',prog:{a1:{p:0.5,q:50}}}]}]});

(async()=>{
const br=await chromium.launch();
// standalone＝模擬 iOS「加到主畫面」；inapp＝模擬 LINE 內建瀏覽器
const openWage=async(mode)=>{
  const ctx=await br.newContext(mode==='inapp'?{userAgent:'Mozilla/5.0 (iPhone) Line/13.0.0'}:{});
  const pg=await ctx.newPage();
  await pg.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await pg.addInitScript(d=>localStorage.setItem('pm_data_v2',JSON.stringify(d)),wageData());
  if(mode==='standalone') await pg.addInitScript(()=>{ try{ Object.defineProperty(navigator,'standalone',{get:()=>true}); }catch(e){} });
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(WAGE); await pg.waitForTimeout(1100);
  await pg.evaluate(()=>{ state.tab='meas'; render(); window.__p=0; window.print=()=>{window.__p++;}; });
  await pg.waitForTimeout(300);
  await pg.click('#export-meas-all'); await pg.waitForTimeout(400);
  return {ctx,pg,errs};
};

// ① 桌機（正常環境）：照舊呼叫 window.print()，不跳新分頁
{
  const {ctx,pg,errs}=await openWage('desktop');
  t('① 偵測結果：不是會失效的環境', await pg.evaluate(()=>printMayFail())===false);
  t('① 不顯示警告字樣', !/列印」常常沒反應/.test(await pg.textContent('#print-overlay')));
  await pg.click('#po-print'); await pg.waitForTimeout(300);
  t('① ★ 按列印就是呼叫 window.print()（桌機行為沒變）',
    await pg.evaluate(()=>window.__p)===1&&ctx.pages().length===1);
  t('① 沒有 JS 錯誤', errs.length===0);
  await ctx.close();
}

// ② ★ iOS 主畫面捷徑：按列印直接改走新分頁（因為 window.print() 在那裡沒反應）
{
  const {ctx,pg,errs}=await openWage('standalone');
  t('② 偵測得出來', await pg.evaluate(()=>printMayFail())===true);
  t('② ★ 預覽上直接寫出為什麼沒反應、該按哪一顆',
    /列印」常常沒反應/.test(await pg.textContent('#print-overlay')));
  const [np]=await Promise.all([ctx.waitForEvent('page'), pg.click('#po-print')]);
  await np.waitForLoadState('domcontentloaded');
  t('② ★ 按列印改開新分頁，而且沒有白呼叫 window.print()',
    await pg.evaluate(()=>window.__p)===0);
  const txt=await np.textContent('body');
  t('② ★ 新分頁內容完整（標題、項次、金額都在）',
    (await np.title())==='計量明細'&&/A1/.test(txt)&&/3,000/.test(txt));
  t('② ★ 新分頁不含工具列按鈕（印出來不會有「關閉」字樣）',
    !/在瀏覽器開啟/.test(txt)&&!/關閉/.test(txt));
  t('② 新分頁看得見內容（沒有被 CSS 藏起來）', await np.isVisible('#print-overlay'));
  t('② 沒有 JS 錯誤', errs.length===0);
  await ctx.close();
}

// ③ LINE 內建瀏覽器也算
{
  const {ctx,pg}=await openWage('inapp');
  t('③ 從 UA 認得出 LINE 內建瀏覽器', await pg.evaluate(()=>printMayFail())===true);
  await ctx.close();
}

// ④ 桌機也還是可以手動按「在瀏覽器開啟」
{
  const {ctx,pg}=await openWage('desktop');
  const [np]=await Promise.all([ctx.waitForEvent('page'), pg.click('#po-tab')]);
  await np.waitForLoadState('domcontentloaded');
  t('④ 桌機手動按也開得出來', /A1/.test(await np.textContent('body')));
  await ctx.close();
}

// ⑤ 進度請款的估驗請款單：同一套
{
  const ctx=await br.newContext();
  const pg=await ctx.newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),progData());
  await pg.addInitScript(()=>{ try{ Object.defineProperty(navigator,'standalone',{get:()=>true}); }catch(e){} });
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(PROG); await pg.waitForTimeout(1000);
  await pg.evaluate(()=>{ window.__p=0; window.print=()=>{window.__p++;}; });
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.click('#btn-print'); await pg.waitForTimeout(500);
  t('⑤ 有「↗ 在瀏覽器開啟」鈕', await pg.locator('#do-tab').count()===1);
  t('⑤ ★ 預覽上寫出為什麼沒反應', /列印」常常沒反應/.test(await pg.textContent('#print-overlay')));
  const [np]=await Promise.all([ctx.waitForEvent('page'), pg.click('#do-print')]);
  await np.waitForLoadState('domcontentloaded');
  const txt=await np.textContent('body');
  t('⑤ ★ 新分頁是完整的估驗請款單（含金額）',
    (await np.title())==='工程估驗請款單'&&/工程估驗請款單/.test(txt)&&/15,000/.test(txt));
  t('⑤ ★ 內容看得見（body.printing 的規則沒把它藏掉）',
    await np.isVisible('#print-overlay'));
  t('⑤ 新分頁不含工具列', !/在瀏覽器開啟/.test(txt));
  t('⑤ 沒有 JS 錯誤', errs.length===0);
  await ctx.close();
}

// ⑥ 補開發票對帳單也一樣
{
  const ctx=await br.newContext();
  const pg=await ctx.newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  const d=progData();
  d.projects[0].periods[0].settled=15000;
  await pg.addInitScript(x=>localStorage.setItem('pm_progress_v1',JSON.stringify(x)),d);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(PROG); await pg.waitForTimeout(1000);
  await pg.evaluate(()=>{ printInvoiceRecon(curProj()); }); await pg.waitForTimeout(400);
  t('⑥ 對帳單也有「↗ 在瀏覽器開啟」', await pg.locator('#do-tab').count()===1);
  const [np]=await Promise.all([ctx.waitForEvent('page'), pg.click('#do-tab')]);
  await np.waitForLoadState('domcontentloaded');
  t('⑥ ★ 新分頁是對帳單且看得見',
    (await np.title())==='補開發票對帳單'&&await np.isVisible('#print-overlay'));
  t('⑥ 沒有 JS 錯誤', errs.length===0);
  await ctx.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
