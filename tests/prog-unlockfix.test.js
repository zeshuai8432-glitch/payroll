// 手機讀不到雲端的兩條非 locked 失敗路徑
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

(async()=>{
const br=await chromium.launch();

// ① 瀏覽器沒有 DecompressionStream，但雲端資料是 z:1 → 要說「瀏覽器太舊」，不是「密碼不對」也不是「離線」
{
  const pg=await (await br.newContext()).newPage();
  await pg.addInitScript(()=>{ delete window.DecompressionStream; });
  let prompted=false;
  pg.on('dialog',async d=>{ if(d.type()==='prompt')prompted=true; await d.dismiss(); });
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({updateTime:'2026-01-01T00:00:00Z',fields:{json:{stringValue:
      JSON.stringify({v:'PMENC1',z:1,iv:'tBfU8DTBuQP3MON8',ct:'AAAA'})}}})}));
  await pg.goto(FILE); await pg.waitForTimeout(1200);
  const st=await pg.textContent('#cloud-status');
  t('① 不支援解壓縮 → 狀態說瀏覽器太舊，不說離線：'+st.trim(), /太舊/.test(st)&&!/離線/.test(st));
  t('① 不會誤判成密碼錯誤而跳密碼框', !prompted);
  const card=await pg.textContent('#app');
  t('① 空白畫面顯示專屬說明卡（不是「還沒有專案」）',
    /讀不出雲端資料/.test(card)&&/資料還在雲端/.test(card)&&!/還沒有專案/.test(card));
  t('① 不提供在這台建新專案（會傳不上去）', await pg.locator('#btn-newproj2').count()===0);
  await pg.close();
}

// ② 瀏覽器擋掉 prompt（丟例外）→ 要變成「未解鎖」卡片，不能變成「離線」
{
  const pg=await (await br.newContext()).newPage();
  await pg.addInitScript(()=>{ window.prompt=()=>{ throw new Error('blocked by browser'); }; });
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({updateTime:'2026-01-01T00:00:00Z',fields:{json:{stringValue:
      JSON.stringify({v:'PMENC1',z:0,iv:'tBfU8DTBuQP3MON8',ct:'AAAA'})}}})}));
  await pg.goto(FILE); await pg.waitForTimeout(1200);
  const st=await pg.textContent('#cloud-status');
  t('② prompt 被擋 → 顯示未解鎖，不是離線：'+st.trim(), /未解鎖/.test(st)&&!/離線/.test(st));
  t('② 出現解鎖按鈕', await pg.locator('#btn-unlock').count()>0);
  await pg.close();
}

// ③ 開頁一律不自動跳密碼框（手機會擋）
{
  const pg=await (await br.newContext()).newPage();
  let prompted=false;
  pg.on('dialog',async d=>{ if(d.type()==='prompt')prompted=true; await d.dismiss(); });
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({updateTime:'2026-01-01T00:00:00Z',fields:{json:{stringValue:
      JSON.stringify({v:'PMENC1',z:0,iv:'tBfU8DTBuQP3MON8',ct:'AAAA'})}}})}));
  await pg.goto(FILE); await pg.waitForTimeout(1200);
  t('③ 開頁不自動問密碼', !prompted);
  const st=await pg.textContent('#cloud-status');
  t('③ 但狀態是未解鎖（資料沒被當成不存在）：'+st.trim(), /未解鎖/.test(st));
  // 按下解鎖按鈕才問
  await pg.click('#btn-unlock'); await pg.waitForTimeout(900);
  t('③ 按解鎖按鈕才會問密碼', prompted);
  await pg.close();
}

// ④ 真的連不到 → 還是要說離線（沒有被上面的改動蓋掉）
{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.abort());
  await pg.goto(FILE); await pg.waitForTimeout(1200);
  const st=await pg.textContent('#cloud-status');
  t('④ 真的沒網路 → 仍顯示離線：'+st.trim(), /離線/.test(st));
  await pg.close();
}

// ⑤ 抓得到雲端但解不開時，絕對不能把本機（空白）資料推上去蓋掉雲端
{
  const pg=await (await br.newContext()).newPage();
  await pg.addInitScript(()=>{ delete window.DecompressionStream; });
  pg.on('dialog',async d=>{ await d.dismiss(); });
  let patched=0;
  await pg.route('**/firestore.googleapis.com/**',r=>{
    const m=r.request().method();
    if(m==='PATCH'||m==='POST'){ patched++; return r.fulfill({status:200,contentType:'application/json',body:'{}'}); }
    r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({updateTime:'2026-01-01T00:00:00Z',fields:{json:{stringValue:
        JSON.stringify({v:'PMENC1',z:1,iv:'tBfU8DTBuQP3MON8',ct:'AAAA'})}}})});
  });
  await pg.goto(FILE); await pg.waitForTimeout(1200);
  // 使用者在這台做了修改 → 觸發存檔／上傳
  await pg.evaluate(()=>{ state.projects.push({id:'p1',name:'手機上新建的',blocks:[],periods:[]}); save(); });
  await pg.waitForTimeout(3500);
  t('⑤ 解不開雲端時不上傳（PATCH 次數＝0，實際 '+patched+'）', patched===0);
  const st=await pg.textContent('#cloud-status');
  t('⑤ 並且明講改動只留本機：'+st.trim(), /本機/.test(st));
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
