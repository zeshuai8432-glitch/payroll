const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

// 總量 6 間。第 1 期填了 3.14 間（填錯），第 2 期改正成 3 間。
// 實際只做 3 間，所以應該可以轉出 3 間。
const seed=(p2)=>({ projects:[
 { id:'m1', name:'案', owner:'業主', vendor:'東澤', taxMode:'excl',
   blocks:[{id:'mb1',name:'TYPE-SK',unit:'間',count:6,items:[
     {id:'ma',no:'6.1',name:'骨架',unit:'㎡',qty:40,price:1000,amount:40000,remark:''}]}],
   periods:[], curPeriod:0, createdAt:1 },
 { id:'kA', parentId:'m1', name:'案-鑫', vendor:'鑫', taxMode:'excl',
   blocks:[{id:'ab1',name:'TYPE-SK',unit:'間',count:6,srcBlk:'mb1',items:[
     {id:'aa',no:'6.1',name:'骨架',unit:'㎡',qty:40,price:700,amount:28000,remark:'',srcId:'ma'}]}],
   periods:[{no:1,date:'2026-09-01',prog:{aa:{p:3.14/6,q:40*3.14}},settled:87920},
            {no:2,date:'2026-09-20',prog:{aa:{p:p2/6,q:40*p2}}}],
   curPeriod:1, createdAt:2 },
 { id:'kB', parentId:'m1', name:'案-阿華', vendor:'阿華', taxMode:'excl',
   blocks:[], periods:[], curPeriod:0, createdAt:3 }
], cur:'kA', tab:'items'});

async function open(br,p2){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  const said=[]; p.on('dialog',d=>{said.push(d.message());d.accept();});
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},seed(p2));
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1200);
  await p.evaluate(()=>{curProj().blocks.forEach(b=>openBlk.add(b.id));render();});
  await p.waitForTimeout(400);
  return {p,errs,said};
}

(async()=>{
  const br=await chromium.launch();

  // ══ ① 第 2 期改正成 3 間後，3 間轉得出去 ══
  {
    const {p,errs,said}=await open(br,3);
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    const done=await p.evaluate(()=>{const pr=curProj(),b=pr.blocks[0];
      return doneCountOf(pr,b,b.items[0]);});
    ok(done===3,'★★ 已完成讀第 2 期（改正後）的 3 間，不是第 1 期那個 3.14（實際 '+done+'）');

    await p.click('[data-xfer="ab1::aa"]'); await p.waitForTimeout(500);
    const mv=await p.evaluate(()=>document.querySelector('#xf-move').value);
    ok(mv==='3','★ 轉出面板預設就帶還沒做的 3 間（6−3）');
    await p.fill('#xf-move','3');
    await p.selectOption('#xf-to','kB');
    await p.click('[data-xferok="ab1::aa"]'); await p.waitForTimeout(900);
    ok(!said.some(m=>/轉太多了/.test(m)),'★★ 沒有被擋下來');
    const r=await p.evaluate(()=>{const A=state.projects.find(x=>x.id==='kA'),B=state.projects.find(x=>x.id==='kB');
      return {aCnt:effCount(A.blocks[0].items[0],A.blocks[0]),
              bCnt:B.blocks[0]?effCount(B.blocks[0].items[0],B.blocks[0]):null};});
    ok(r.aCnt===3,'★★ 鑫這條剩 3 間');
    ok(r.bCnt===3,'★★ 阿華拿到 3 間');
    await p.close();
  }

  // ══ ② 沒改正（第 2 期還是 3.14）時仍然擋，並講清楚去哪改 ══
  {
    const {p,said}=await open(br,3.14);
    await p.click('[data-xfer="ab1::aa"]'); await p.waitForTimeout(500);
    await p.fill('#xf-move','3');
    await p.selectOption('#xf-to','kB');
    await p.click('[data-xferok="ab1::aa"]'); await p.waitForTimeout(800);
    ok(said.some(m=>/轉太多了/.test(m)),'② 真的做了 3.14 間時照樣擋（保護還在）');
    ok(said.some(m=>/是讀「第 2 期」（最新一期）填的完成度/.test(m)),
       '★★ 而且講明這個數字是讀哪一期來的');
    ok(said.some(m=>/先到「進度請款」的第 2 期把這條改成實際的數字/.test(m)),
       '★★ 直接告訴你去哪改、改完再回來轉');
    const r=await p.evaluate(()=>effCount(state.projects.find(x=>x.id==='kA').blocks[0].items[0],
      state.projects.find(x=>x.id==='kA').blocks[0]));
    ok(r===6,'★ 被擋下來時什麼都沒改');
    await p.close();
  }

  // ══ ③ 面板上標明數字來自哪一期 ══
  {
    const {p}=await open(br,3);
    await p.click('[data-xfer="ab1::aa"]'); await p.waitForTimeout(500);
    const t=await p.evaluate(()=>document.body.innerText);
    ok(/已完成 3 間（第 2 期填的）/.test(t),'③ 面板直接標「（第 2 期填的）」，數字不對知道去哪改');
    await p.close();
  }

  // ══ ④ 在最新一期清成 0：整條都能轉走 ══
  {
    const {p,said}=await open(br,0);
    const done=await p.evaluate(()=>{const pr=curProj(),b=pr.blocks[0];return doneCountOf(pr,b,b.items[0]);});
    ok(done===0,'④ 最新一期歸零＝已完成 0（舊期的 3.14 不會再卡著）');
    await p.click('[data-xfer="ab1::aa"]'); await p.waitForTimeout(500);
    await p.fill('#xf-move','6');
    await p.selectOption('#xf-to','kB');
    await p.click('[data-xferok="ab1::aa"]'); await p.waitForTimeout(900);
    ok(!said.some(m=>/轉太多了/.test(m)),'★★ 整條 6 間轉得出去');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
