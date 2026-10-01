const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

// 母：EXS 5 間 × 136,171/間 ＝ 680,855；另一個房型 SK 2 間 × 50,000 ＝ 100,000
// 子：完全重寫過的合約（名稱、條數、數量、單價都不一樣）
const mk=(kidItems,extra)=>({ projects:[
 { id:'m1', name:'某案', owner:'業主', vendor:'東澤', taxMode:'excl',
   blocks:[
     {id:'mb1',name:'TYPE-EXS 行政套房',unit:'間',count:5,items:[
       {id:'ma',no:'1',name:'天花',unit:'㎡',qty:40,price:2000,amount:80000,remark:''},
       {id:'mb',no:'2',name:'隔間',unit:'㎡',qty:56.171,price:1000,amount:56171,remark:''}]},
     {id:'mb2',name:'TYPE-SK',unit:'間',count:2,items:[
       {id:'mc',no:'3',name:'天花',unit:'㎡',qty:50,price:1000,amount:50000,remark:''}]},
     {id:'mb3',name:'追加工程',unit:'式',count:1,items:[
       {id:'mx',no:'增',name:'臨時加做',unit:'式',qty:1,price:99999,amount:99999,remark:'',extra:true}]}],
   periods:[], curPeriod:0, createdAt:1 },
 { id:'k1', parentId:'m1', name:'某案-阿明', vendor:'阿明', taxMode:'excl',
   blocks:[{id:'kb1',name:'TYPE-EXS 行政套房',unit:'間',count:5,srcBlk:'mb1',items:kidItems}],
   periods:[], curPeriod:0, createdAt:2 },
 ...(extra||[])
], cur:'m1', tab:'alloc'});

// 完全自己重寫：一條、名稱自創、數量單價都跟母合約無關、也沒有 srcId
const rewrite=(amtPerRoom)=>[{id:'ka',no:'A',name:'牆面全包（我自己的講法）',unit:'式',qty:1,price:amtPerRoom,amount:amtPerRoom,remark:''}];

async function open(br,seed){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},seed);
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1300);
  const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
  const ba=await p.evaluate(()=>{const b=blockAllocationOf(state.projects[0]);
    return {over:b.over,totMother:b.totMother,totAlloc:b.totAlloc,totLeft:b.totLeft,stray:b.stray.length,
      rows:b.rows.map(r=>({n:r.blk.name,母:r.mAmt,發:r.aAmt,剩:r.left,over:r.over}))};});
  return {p,errs,t,ba};
}

(async()=>{
  const br=await chromium.launch();

  // ══ ① 子合約完全重寫、沒超過：不報錯 ══
  {
    const {p,errs,t,ba}=await open(br,mk(rewrite(120000)));   // 120,000×5＝600,000 < 680,855
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    const exs=ba.rows.find(r=>/EXS/.test(r.n));
    ok(exs.母===680855,'★ 母合約 EXS 明細金額 680,855（136,171×5）');
    ok(exs.發===600000,'★★ 已發包 600,000——子合約名稱、條數、數量、單價全都自己寫的，照樣算得出來');
    ok(exs.剩===80855,'★★ 剩餘 80,855（自辦＋毛利，合在一起）');
    ok(exs.over===false&&ba.over===0,'★★ 沒超過就不報錯');
    ok(/子專案的合約可以任意重寫/.test(t),'★ 畫面講明子合約可以任意重寫');
    await p.close();
  }

  // ══ ② 超過母合約：報錯 ══
  {
    const {p,t,ba}=await open(br,mk(rewrite(140000)));   // 140,000×5＝700,000 > 680,855
    const exs=ba.rows.find(r=>/EXS/.test(r.n));
    ok(exs.發===700000&&exs.剩===-19145,'② 發包 700,000，剩餘 −19,145');
    ok(exs.over===true&&ba.over===1,'★★ 超過就標出來');
    ok(/有 1 個房型發包金額超過母合約/.test(t),'★★ 上方跳警告');
    ok(/發出去的比收得到的還多/.test(t),'★ 並說明為什麼是問題');
    await p.close();
  }

  // ══ ③ 追加工程不列入（本來就不在原合約） ══
  {
    const {ba,p}=await open(br,mk(rewrite(120000)));
    ok(!ba.rows.some(r=>r.n==='追加工程'&&r.母>0),'③ 追加工程那條母金額不計入（實際 '+JSON.stringify(ba.rows.find(r=>r.n==='追加工程'))+'）');
    ok(ba.totMother===680855+100000,'★★ 母合約總額只含原合約兩個房型 780,855');
    await p.close();
  }

  // ══ ④ 沒發包的房型顯示「尚未發包」 ══
  {
    const {ba,t,p}=await open(br,mk(rewrite(120000)));
    const sk=ba.rows.find(r=>r.n==='TYPE-SK');
    ok(sk.發===0&&sk.剩===100000,'④ TYPE-SK 還沒發包，剩餘＝母金額 100,000');
    ok(/尚未發包/.test(t),'★ 標「尚未發包」');
    await p.close();
  }

  // ══ ⑤ 同一房型發給兩家：合計比對 ══
  {
    const {ba,p}=await open(br,mk(rewrite(100000),[
      { id:'k2', parentId:'m1', name:'某案-進凱', vendor:'進凱', taxMode:'excl',
        blocks:[{id:'k2b',name:'TYPE-EXS 行政套房',unit:'間',count:5,srcBlk:'mb1',
          items:[{id:'kc',no:'B',name:'油漆全包',unit:'式',qty:1,price:40000,amount:40000,remark:''}]}],
        periods:[], curPeriod:0, createdAt:3 }]));
    const exs=ba.rows.find(r=>/EXS/.test(r.n));
    ok(exs.發===100000*5+40000*5,'⑤ 兩家加起來 700,000（阿明 500,000＋進凱 200,000）');
    ok(exs.over===true,'★★ 兩家合計超過母合約就報錯（單看一家都沒超過）');
    await p.close();
  }

  // ══ ⑥ 子區塊對不到母合約：錢不會憑空消失 ══
  {
    const {ba,t,p}=await open(br,mk(rewrite(120000),[
      { id:'k3', parentId:'m1', name:'某案-阿華', vendor:'阿華', taxMode:'excl',
        blocks:[{id:'k3b',name:'我亂取的區塊名',unit:'間',count:1,
          items:[{id:'kd',no:'C',name:'雜項',unit:'式',qty:1,price:55000,amount:55000,remark:''}]}],
        periods:[], curPeriod:0, createdAt:4 }]));
    ok(ba.stray===1,'⑥ 對不到母合約的子區塊會被抓出來');
    ok(/有 1 個子專案的區塊對不到母合約/.test(t)&&/55,000/.test(t),'★★ 列出來並講金額，不會悄悄漏掉');
    ok(/把子專案那個區塊的名稱改成跟母合約一樣/.test(t),'★ 並告訴你怎麼修');
    await p.close();
  }

  // ══ ⑦ 逐條核對收進摺疊區，不再當主要警告 ══
  {
    const {p}=await open(br,mk(rewrite(120000)));
    const r=await p.evaluate(()=>{
      const ds=[...document.querySelectorAll('details')].map(d=>({t:(d.querySelector('summary')||{}).textContent||'',open:d.open}));
      return ds.filter(x=>/逐條核對/.test(x.t));});
    ok(r.length===1,'⑦ 逐條核對做成摺疊區');
    ok(r[0].open===false,'★★ 預設收起來，不干擾');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
