// 母專案：每一條發給誰、各幾間
const {chromium}=require('playwright');
const path=require('path'), FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};

const seed=()=>({savedAt:Date.now(),tab:'alloc',cur:'A',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bA',name:'TYPE-EXS',unit:'間',count:40,items:[
      // ① 整條發給一家
      {id:'m1',no:'3.1',name:'平頂暗架天花板',unit:'㎡',qty:30,price:300,amount:9000},
      // ② 拆成工序、分給兩家，而且量不一樣
      {id:'m2',no:'6.3',name:'雙面隔間',unit:'㎡',qty:9.15,price:300,amount:2745},
      // ③ 完全沒發
      {id:'m3',no:'9.9',name:'收邊收尾',unit:'式',qty:1,price:5000,amount:5000},
      // ④ 一部分自辦
      {id:'m4',no:'4.1',name:'輕鋼架',unit:'㎡',qty:10,price:200,amount:2000,selfQty:50}]}]},
  {id:'T',name:'凱子-代工-東澤',vendor:'東澤',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bT',name:'TYPE-EXS',unit:'間',count:40,srcBlk:'bA',items:[
      {id:'t1',no:'3.1',name:'平頂暗架天花板',unit:'㎡',qty:30,price:140,amount:4200,srcId:'m1',cnt:40},
      {id:'t2',no:'6.3',name:'雙面隔間-骨架',unit:'㎡',qty:9.15,price:140,amount:1281,srcId:'m2',cnt:6,
       groupId:'gT',groupName:'雙面隔間'},
      {id:'t3',no:'6.3',name:'雙面隔間-封板',unit:'㎡',qty:9.15,price:140,amount:1281,srcId:'m2',cnt:12,
       groupId:'gT',groupName:'雙面隔間'},
      {id:'t4',no:'4.1',name:'輕鋼架',unit:'㎡',qty:10,price:100,amount:1000,srcId:'m4',cnt:30}]}]},
  {id:'C',name:'凱子-代工-鑫',vendor:'鑫',parentId:'A',taxMode:'excl',signedTotal:0,periods:[],blocks:[
    {id:'bC',name:'TYPE-EXS',unit:'間',count:40,srcBlk:'bA',items:[
      {id:'c1',no:'6.3',name:'雙面隔間-骨架',unit:'㎡',qty:9.15,price:140,amount:1281,srcId:'m2',cnt:10,
       groupId:'gC',groupName:'雙面隔間'}]}]}]});

(async()=>{
const br=await chromium.launch();
const open=async st=>{
  const pg=await (await br.newContext()).newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  return {pg,errs};
};
const rowOf=(pg,no)=>pg.evaluate(n=>{
  const tr=[...document.querySelectorAll('#app details table tr')]
    .find(r=>r.children[0]&&r.children[0].textContent.trim()===n);
  return tr?tr.innerText.replace(/\s+/g,' '):'(沒找到)';},no);

{
  const {pg,errs}=await open(seed());
  t('① 區塊有這個新區段', /每一條發給誰/.test(await pg.textContent('#app')));
  t('① 沒有 JS 錯誤', errs.length===0);

  const r1=await rowOf(pg,'3.1');
  t('② 整條發給一家：東澤 40、沒有「還沒發」：'+r1.slice(0,40), /東澤 40/.test(r1)&&!/還沒發/.test(r1));

  const r2=await rowOf(pg,'6.3');
  t('③ ★ 拆成工序要分道列（骨架／封板各一行）', /骨架/.test(r2)&&/封板/.test(r2));
  t('③ ★ 骨架：東澤 6 ＋ 鑫 10 → 還沒發 24', /東澤 6/.test(r2)&&/鑫 10/.test(r2)&&/還沒發 24/.test(r2));
  t('③ ★ 封板：只有東澤 12 → 還沒發 28', /東澤 12/.test(r2)&&/還沒發 28/.test(r2));

  const r3=await rowOf(pg,'9.9');
  t('④ 完全沒發的講「尚未發包」', /尚未發包/.test(r3));

  const r4=await rowOf(pg,'4.1');
  // 母 10㎡/間、selfQty 50 → 自辦 5 間；東澤 30 間 → 還沒發 40−30−5＝5
  t('⑤ 自辦換算成間數（50㎡ ÷ 10 ＝ 5 間）', /自辦 5/.test(r4));
  t('⑤ 還沒發扣掉自辦（40−30−5＝5）', /東澤 30/.test(r4)&&/還沒發 5/.test(r4));
  await pg.close();
}

// ⑥ 超出要紅字講出來
{
  const st=seed();
  st.projects[1].blocks[0].items[0].cnt=45;   // 東澤拿 45 間 > 合約 40
  const {pg}=await open(st);
  const r=await rowOf(pg,'3.1');
  t('⑥ 超出合約間數要標出來（45 − 40 ＝ 5）', /超出 5/.test(r));
  await pg.close();
}

// ⑦ 沒有子專案時不該出現這個區段（發包分配分頁本身就不存在）
{
  const st=seed();
  st.projects=[st.projects[0]];
  const {pg}=await open(st);
  await pg.waitForTimeout(300);
  t('⑦ 沒有子專案就沒有發包分配分頁', await pg.evaluate(()=>state.tab)!=='alloc');
  await pg.close();
}

await br.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
