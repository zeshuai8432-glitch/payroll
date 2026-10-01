// 複製細項可以勾選：來源含「這一份的其他房型」，不再整個區塊硬塞
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

const seed=extra=>({savedAt:Date.now(),tab:'items',cur:'A',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,trash:[],periods:[],blocks:[
    {id:'b1',name:'TYPE-EXS',unit:'間',count:2,items:[
      {id:'i1',no:'6.1',chapter:'第六章',name:'雙面隔間-骨架',unit:'㎡',qty:10,price:120,amount:1200,groupId:'g1',groupName:'雙面隔間',printAs:'雙面隔間'},
      {id:'i2',no:'6.2',chapter:'第六章',name:'雙面隔間-封板',unit:'㎡',qty:10,price:100,amount:1000,groupId:'g1',groupName:'雙面隔間',printAs:'雙面隔間'},
      {id:'i3',no:'6.9',chapter:'第六章',name:'壁龕',unit:'㎡',qty:2.5,price:280,amount:700,remark:'至天花板'},
      {id:'i4',no:'6.20',name:'走道天花',unit:'㎡',qty:8,price:260,amount:2080,
       remark:'圖面編號D1/F1；2026-10-01 原 40 間，轉 6 間 給 鑫'}]},
    {id:'b2',name:'TYPE-L',unit:'間',count:1,items:[
      {id:'j1',no:'6.9',name:'壁龕',unit:'㎡',qty:2.5,price:280,amount:700}]}]},
  ...(extra||[])]});

(async()=>{
const br=await chromium.launch();
const open=async st=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(800);
  pg.on('dialog',async d=>{ await d.accept(); });
  return {pg,errs};
};
const panel=pg=>pg.textContent('.card[style*="167,139,250"]');

// ① 只有一個專案時，也能從「這一份的其他房型」複製（舊版這顆按鈕根本不出現）
{
  const {pg,errs}=await open(seed());
  await pg.evaluate(()=>{ openBlk.add('b2'); render(); }); await pg.waitForTimeout(250);
  t('① 單一專案也有複製按鈕', await pg.locator('[data-xcopy="b2"]').count()===1);
  t('① 舊的「複製細項自其他區塊」按鈕已移除', await pg.locator('[data-copyinto]').count()===0);
  await pg.click('[data-xcopy="b2"]'); await pg.waitForTimeout(300);
  const sel=await pg.locator('[data-xcopyproj="1"] option').allTextContents();
  t('① 來源清單第一項是「這一份」：'+sel[0], /^這一份/.test(sel[0]));
  await pg.selectOption('[data-xcopyproj="1"]','A'); await pg.waitForTimeout(200);
  const blks=await pg.locator('[data-xcopyblk="1"] option').allTextContents();
  t('① 目標房型自己不會列在來源裡', !blks.some(x=>/TYPE-L/.test(x))&&blks.some(x=>/TYPE-EXS/.test(x)));
  t('① 沒有 JS 錯誤', errs.length===0);

  await pg.selectOption('[data-xcopyblk="1"]','b1'); await pg.waitForTimeout(300);
  const p=await panel(pg);
  t('② 有勾選框，不是整個區塊硬塞', await pg.locator('[data-xcpick]').count()>0);
  t('② TYPE-L 已經有壁龕 → 標已經有了', /已經有了/.test(p));
  t('② 可勾的是其餘 3 條', await pg.locator('[data-xcpick]').count()===3);

  // 只勾兩條（骨架、封板），不要走道天花
  await pg.click('[data-xcpick="i1"]'); await pg.click('[data-xcpick="i2"]');
  await pg.waitForTimeout(150);
  await pg.click('[data-xcopyok="b2"]'); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>state.projects[0].blocks[1].items.map(x=>({
    no:x.no,nm:x.name,ch:x.chapter||'',pa:x.printAs||'',gid:x.groupId||'',ex:x.extra})));
  t('③ 只進來勾的那兩條（原 1＋2＝3）', r.length===3);
  t('③ 沒勾的「走道天花」沒進來', !r.some(x=>x.nm==='走道天花'));
  t('③ 項次照帶，不是「增」', r[1].no==='6.1'&&r[2].no==='6.2');
  t('③ 不被當成追加工程', r[1].ex!==true&&r[2].ex!==true);
  t('③ 章節與印作照帶', r[1].ch==='第六章'&&r[1].pa==='雙面隔間');
  t('③ 工序群組併成同一組、且換了新 id', r[1].gid===r[2].gid&&r[1].gid!=='g1');
  await pg.close();
}

// ④ 可以改這份要用的單價
{
  const {pg}=await open(seed());
  await pg.evaluate(()=>{ openBlk.add('b2'); render(); }); await pg.waitForTimeout(250);
  await pg.click('[data-xcopy="b2"]'); await pg.waitForTimeout(250);
  await pg.selectOption('[data-xcopyproj="1"]','A'); await pg.waitForTimeout(200);
  await pg.selectOption('[data-xcopyblk="1"]','b1'); await pg.waitForTimeout(300);
  await pg.click('[data-xcpick="i4"]');
  await pg.fill('[data-xcprice="i4"]','200');
  await pg.click('[data-xcopyok="b2"]'); await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>{const it=state.projects[0].blocks[1].items.find(x=>x.name==='走道天花');
    return it?{p:it.price,a:it.amount}:null;});
  t('④ 單價可以改成這份要用的（200，不是來源 260）', !!r&&r.p===200&&r.a===1600);
  await pg.close();
}

// ⑤ 別的專案還是照樣選得到（原本的用法沒壞）
{
  const Z={id:'Z',name:'業主連工帶料',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bz',name:'TYPE-EXS',unit:'間',count:2,items:[
      {id:'z1',no:'6.30',name:'只有業主那份才有的一條',unit:'㎡',qty:3,price:2000,amount:6000}]}]};
  const {pg}=await open(seed([Z]));
  await pg.evaluate(()=>{ openBlk.add('b1'); render(); }); await pg.waitForTimeout(250);
  await pg.click('[data-xcopy="b1"]'); await pg.waitForTimeout(300);
  const sel=await pg.locator('[data-xcopyproj="1"] option').allTextContents();
  t('⑤ 兩份都在清單裡', sel.length===2&&sel.some(x=>/業主連工帶料/.test(x)));
  const cur=await pg.inputValue('[data-xcopyproj="1"]');
  t('⑤ 有別的專案時預設挑別的專案（原行為）', cur==='Z');
  await pg.selectOption('[data-xcopyblk="1"]','bz'); await pg.waitForTimeout(300);
  await pg.click('[data-xcpick="z1"]');
  await pg.click('[data-xcopyok="b1"]'); await pg.waitForTimeout(600);
  const got=await pg.evaluate(()=>state.projects[0].blocks[0].items.map(x=>x.no));
  t('⑤ 跨專案複製照樣帶項次 6.30', got.includes('6.30'));
  await pg.close();
}

// ⑥ 複製過來的錢要算進母合約金額與折讓分母（舊版寫死「增」＝追加，整筆被排除）
{
  const {pg}=await open(seed());
  await pg.evaluate(()=>{ openBlk.add('b2'); render(); }); await pg.waitForTimeout(250);
  await pg.click('[data-xcopy="b2"]'); await pg.waitForTimeout(250);
  await pg.selectOption('[data-xcopyproj="1"]','A'); await pg.waitForTimeout(200);
  await pg.selectOption('[data-xcopyblk="1"]','b1'); await pg.waitForTimeout(300);
  await pg.click('[data-xcopyall="b2"]'); await pg.waitForTimeout(200);
  await pg.click('[data-xcopyok="b2"]'); await pg.waitForTimeout(600);
  const m=await pg.evaluate(()=>{
    const p=state.projects[0], b=p.blocks[1];
    return {sum:b.items.reduce((a,it)=>a+(isExtraItem(it)?0:itemValue(it,b)),0),
            vb:vbaseOf(p), nExtra:b.items.filter(it=>isExtraItem(it)).length};
  });
  // TYPE-L 1 間：既有壁龕 700 ＋ 骨架 1200 ＋ 封板 1000 ＋ 走道天花 2080 ＝ 4,980
  t('⑥ 複製過來的錢算進區塊金額（4,980，實際 '+m.sum+'）', Math.abs(m.sum-4980)<0.5);
  t('⑥ 沒有任何一條被誤判成追加工程', m.nExtra===0);
  // 折讓分母：TYPE-EXS 2 間 ×4,980 ＝ 9,960 ＋ TYPE-L 4,980 ＝ 14,940
  t('⑥ 也算進折讓分母（14,940，實際 '+m.vb+'）', Math.abs(m.vb-14940)<0.5);

  // 項次有帶過來，智慧排序才排得動
  await pg.evaluate(()=>{ openBlk.add('b2'); render(); }); await pg.waitForTimeout(200);
  await pg.click('[data-sortitems="b2"]'); await pg.waitForTimeout(600);
  const order=await pg.evaluate(()=>state.projects[0].blocks[1].items.map(x=>x.no));
  t('⑥ 智慧排序排得動（6.1 → 6.2 → 6.9 → 6.20）：'+order.join(' '),
    order.join(' ')==='6.1 6.2 6.9 6.20');
  await pg.close();
}

// ⑦ 複製時不要把系統寫的轉出紀錄一起帶過來（那是來源那份的歷史，在這裡是假的）
{
  const {pg}=await open(seed());
  await pg.evaluate(()=>{ openBlk.add('b2'); render(); }); await pg.waitForTimeout(250);
  await pg.click('[data-xcopy="b2"]'); await pg.waitForTimeout(250);
  await pg.selectOption('[data-xcopyproj="1"]','A'); await pg.waitForTimeout(200);
  await pg.selectOption('[data-xcopyblk="1"]','b1'); await pg.waitForTimeout(300);
  await pg.click('[data-xcpick="i4"]');
  await pg.click('[data-xcopyok="b2"]'); await pg.waitForTimeout(600);
  const got=await pg.evaluate(()=>{const b=state.projects[0].blocks[1];
    const it=b.items.find(x=>x.name==='走道天花'); return it?(it.remark||''):'(沒找到)';});
  t('⑦ 自己寫的備註留著（圖面編號）：'+got, /圖面編號D1\/F1/.test(got));
  t('⑦ 系統寫的轉出紀錄沒被帶過來', !/轉 6 間 給 鑫/.test(got)&&!/原 40 間/.test(got));
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
