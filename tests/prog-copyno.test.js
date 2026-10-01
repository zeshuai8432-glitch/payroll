// 複製細項自其他區塊：項次要跟著來，而且不能被當成追加工程
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

const seed=()=>({savedAt:Date.now(),tab:'items',cur:'A',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,trash:[],periods:[],blocks:[
    {id:'b1',name:'TYPE-EXS',unit:'間',count:2,items:[
      {id:'i1',no:'6.1',chapter:'第六章 輕隔間',name:'雙面隔間-骨架',unit:'㎡',qty:10,price:120,amount:1200,
       groupId:'g1',groupName:'雙面隔間',printAs:'雙面隔間',remark:'至天花板'},
      {id:'i2',no:'6.2',chapter:'第六章 輕隔間',name:'雙面隔間-封板',unit:'㎡',qty:10,price:100,amount:1000,
       groupId:'g1',groupName:'雙面隔間',printAs:'雙面隔間'},
      {id:'i3',no:'6.9',chapter:'第六章 輕隔間',name:'壁龕',unit:'㎡',qty:2.5,price:280,amount:700},
      {id:'i4',no:'增',name:'現場追加補強',unit:'式',qty:1,price:3000,amount:3000,extra:true}]},
    {id:'b2',name:'TYPE-L',unit:'間',count:1,items:[
      {id:'j1',no:'1.1',name:'既有的一條',unit:'㎡',qty:1,price:50,amount:50}]}]}]});

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

{
  const {pg,errs}=await open(seed());
  // 複製 TYPE-EXS 的細項到 TYPE-L
  await pg.evaluate(()=>{ openBlk.add('b2'); render(); }); await pg.waitForTimeout(250);
  await pg.click('[data-copyinto="b2"]'); await pg.waitForTimeout(250);
  await pg.selectOption('#copy-src','b1'); await pg.waitForTimeout(150);
  await pg.click('[data-copyok="b2"]'); await pg.waitForTimeout(600);

  const r=await pg.evaluate(()=>state.projects[0].blocks[1].items.map(x=>({
    no:x.no,ch:x.chapter||'',nm:x.name,pa:x.printAs||'',gn:x.groupName||'',gid:x.groupId||'',
    ex:x.extra,q:x.qty,p:x.price,a:x.amount,rk:x.remark||''})));

  t('① 4 條都複製過來了（原本 1 條＋4＝5）', r.length===5);
  const n=r.slice(1).map(x=>x.no);
  t('② 項次照帶，不再變成「增」：'+n.join(' / '), n[0]==='6.1'&&n[1]==='6.2'&&n[2]==='6.9');
  t('③ 一般細項不會被當成追加工程', r[1].ex!==true&&r[2].ex!==true&&r[3].ex!==true);
  t('④ 本來就是追加的那條，追加旗標保留（項次仍是「增」）', r[4].no==='增'&&r[4].ex===true);
  t('⑤ 章節跟著帶', r[1].ch==='第六章 輕隔間');
  t('⑥ 列印合併名稱跟著帶', r[1].pa==='雙面隔間'&&r[2].pa==='雙面隔間');
  t('⑦ 備註跟著帶', r[1].rk==='至天花板');
  t('⑧ 數量單價金額正確', r[1].q===10&&r[1].p===120&&r[1].a===1200);
  t('⑨ 工序群組併成同一組，而且不是沿用來源的 groupId（避免跨區塊撞號）',
    r[1].gn==='雙面隔間'&&r[1].gid===r[2].gid&&r[1].gid!=='g1');
  t('⑩ 沒有 JS 錯誤', errs.length===0);

  // 關鍵：這些錢要算進「母合約金額」。追加的那條照規則仍然排除。
  const money=await pg.evaluate(()=>{
    const b=state.projects[0].blocks[1];
    const sum=b.items.reduce((a,it)=>a+(isExtraItem(it)?0:itemValue(it,b)),0);
    return {sum, vb:vbaseOf(state.projects[0])};
  });
  // TYPE-L 1 間：既有 50 ＋ 1200 ＋ 1000 ＋ 700 ＝ 2,950（追加 3,000 排除）
  t('⑪ 複製過來的錢算進區塊金額了（2,950，實際 '+money.sum+'）', Math.abs(money.sum-2950)<0.5);
  // 折讓分母：TYPE-EXS 2 間 ×(1200+1000+700)=5,800 ＋ TYPE-L 2,950 ＝ 8,750
  t('⑫ 也算進折讓分母（8,750，實際 '+money.vb+'）', Math.abs(money.vb-8750)<0.5);

  // 項次回來了，智慧排序才排得動
  await pg.evaluate(()=>{ openBlk.add('b2'); render(); }); await pg.waitForTimeout(200);
  await pg.click('[data-sortitems="b2"]'); await pg.waitForTimeout(600);
  const order=await pg.evaluate(()=>state.projects[0].blocks[1].items.map(x=>x.no));
  t('⑬ 智慧排序排得動（1.1 → 6.1 → 6.2 → 6.9，增在最後）：'+order.join(' '),
    order[0]==='1.1'&&order[1]==='6.1'&&order[2]==='6.2'&&order[3]==='6.9'&&order[4]==='增');
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
