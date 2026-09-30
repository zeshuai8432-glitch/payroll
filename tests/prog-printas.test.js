const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

// 母：EXS 5 間，三條（天花 40、隔間 20、油漆 10 ㎡/間）
// 子：資料逐條對應（不合併），但三條都填「列印合併名稱＝牆面工程」
const mk=(printAs)=>({ projects:[
 { id:'m1', name:'某案', owner:'業主', vendor:'東澤', taxMode:'excl',
   blocks:[{id:'mb1',name:'TYPE-EXS',unit:'間',count:5,items:[
     {id:'ma',no:'1',name:'天花',unit:'㎡',qty:40,price:1000,amount:40000,remark:''},
     {id:'mb',no:'2',name:'隔間',unit:'㎡',qty:20,price:1000,amount:20000,remark:''},
     {id:'mc',no:'3',name:'油漆',unit:'㎡',qty:10,price:1000,amount:10000,remark:''}]}],
   periods:[], curPeriod:0, createdAt:1 },
 { id:'k1', parentId:'m1', name:'某案-阿明', vendor:'阿明', taxMode:'excl',
   blocks:[{id:'kb1',name:'TYPE-EXS',unit:'間',count:5,srcBlk:'mb1',items:[
     {id:'ka',no:'1',name:'天花',unit:'㎡',qty:40,price:900,amount:36000,remark:'',srcId:'ma',...(printAs?{printAs:'牆面工程'}:{})},
     {id:'kb',no:'2',name:'隔間',unit:'㎡',qty:20,price:900,amount:18000,remark:'',srcId:'mb',...(printAs?{printAs:'牆面工程'}:{})},
     {id:'kc',no:'3',name:'油漆',unit:'㎡',qty:10,price:900,amount:9000,remark:'',srcId:'mc',...(printAs?{printAs:'牆面工程'}:{})}]}],
   periods:[{no:1,date:'2026-09-01',prog:{ka:{p:1,q:200},kb:{p:1,q:100},kc:{p:0.5,q:25}}}],
   curPeriod:0, createdAt:2 }
], cur:'k1', tab:'prog'});

async function open(br,printAs){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},mk(printAs));
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1200);
  await p.evaluate(()=>{window.print=function(){};});
  await p.click('#btn-print'); await p.waitForTimeout(900);
  const d=await p.evaluate(()=>{const el=document.querySelector('#print-overlay .pcontent');return el?el.innerText.replace(/\s+/g,' '):'';});
  return {p,errs,d};
}

(async()=>{
  const br=await chromium.launch();

  // ══ ① 沒填合併名稱：逐條印，跟以前一樣 ══
  {
    const {p,errs,d}=await open(br,false);
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    ok(/天花/.test(d)&&/隔間/.test(d)&&/油漆/.test(d),'★ 三條分開印');
    ok(!/牆面工程/.test(d),'★ 沒有合併行');
    await p.close();
  }

  // ══ ② 填了就併成一行，金額加總 ══
  {
    const {p,errs,d}=await open(br,true);
    ok(errs.length===0,'② JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    ok(/牆面工程/.test(d),'★★ 印成一行「牆面工程」');
    ok(/含 天花、隔間、油漆/.test(d),'★★ 底下小字列出含哪幾條（工班看得懂）');
    // 合併行總價 36,000+18,000+9,000＝63,000（每間）
    ok(/63,000/.test(d),'★★ 總價加總 63,000');
    // 累計：天花 36,000×5＝180,000、隔間 18,000×5＝90,000、油漆 9,000×5×0.5＝22,500 → 292,500
    ok(/292,500/.test(d),'★★ 累計完成計價加總 292,500');
    // 數量同單位 → 40+20+10＝70
    ok(/ 70 /.test(d),'★ 同單位時數量加總 70 ㎡');
    await p.close();
  }

  // ══ ③ 關鍵：資料仍逐條，發包分配沒有假超額 ══
  {
    const {p}=await open(br,true);
    const a=await p.evaluate(()=>{const al=allocationOf(state.projects[0]);
      return {超額:al.over,rows:al.rows.map(x=>({n:x.it.name,母量:x.mQty,已分配:x.aQty,剩:x.leftQty,over:x.over}))};});
    ok(a.超額===0,'★★ ③ 零超額——合併只發生在紙上，資料還是逐條對母專案');
    ok(a.rows.every(r=>r.已分配===r.母量),'★★ 三條的已分配量都剛好等於母量（'+JSON.stringify(a.rows.map(r=>r.n+':'+r.已分配+'/'+r.母量))+'）');
    ok(a.rows.every(r=>r.剩===0),'★ 沒有一條被誤判成還沒發包');
    await p.close();
  }

  // ══ ④ 小計不受影響（合併只是換個印法）══
  {
    const a=await open(br,false), b=await open(br,true);
    const num=t=>{const m=t.match(/累計完成計價 合計 \$([\d,]+)/);return m?m[1]:null;};
    ok(num(a.d)===num(b.d)&&num(a.d)!==null,'④ 合併前後「累計完成計價 合計」一樣（'+num(a.d)+'）');
    await a.p.close(); await b.p.close();
  }

  // ══ ⑤ 合約明細看得到標記，編輯表單存得起來 ══
  {
    const {p}=await open(br,false);
    await p.evaluate(()=>{const ov=document.getElementById('print-overlay');
      document.body.classList.remove('printing'); if(ov) ov.innerHTML='';
      state.tab='items'; render(); curProj().blocks.forEach(b=>openBlk.add(b.id)); render();});
    await p.waitForTimeout(500);
    await p.click('[data-edititem="kb1::ka"]'); await p.waitForTimeout(400);
    ok(!!(await p.$('#if-printas')),'⑤ 細項編輯有「列印合併名稱」欄');
    await p.fill('#if-printas','牆面工程');
    await p.click('[data-itemok="kb1::ka"]'); await p.waitForTimeout(700);
    ok(await p.evaluate(()=>state.projects[1].blocks[0].items[0].printAs)==='牆面工程','★★ 存得起來');
    const t=await p.evaluate(()=>document.body.innerText);
    ok(/印作「牆面工程」/.test(t),'★★ 合約明細列表標「印作「牆面工程」」，一眼看得出哪幾條會併');
    // 清空可以取消
    await p.click('[data-edititem="kb1::ka"]'); await p.waitForTimeout(400);
    await p.fill('#if-printas','');
    await p.click('[data-itemok="kb1::ka"]'); await p.waitForTimeout(700);
    ok(await p.evaluate(()=>state.projects[1].blocks[0].items[0].printAs)===undefined,'★ 清空就取消合併');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
