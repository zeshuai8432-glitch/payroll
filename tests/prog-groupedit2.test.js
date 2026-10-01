const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

const seed={ projects:[
 { id:'p1', name:'某案', owner:'業主', vendor:'東澤', taxMode:'excl',
   blocks:[{id:'b1',name:'TYPE-SK',unit:'間',count:10,items:[
     {id:'g1',no:'6.1',tag:'',chapter:'內隔間',name:'床頭/電視牆/玄關分戶牆乾區複牆；含C40輕鋼骨架-骨架',unit:'㎡',qty:43.72,price:140,amount:6120.8,remark:'',groupId:'gg',groupName:'床頭/電視牆/玄關分戶牆乾區複牆；含C40輕鋼骨架'},
     {id:'g2',no:'6.1',tag:'',chapter:'內隔間',name:'床頭/電視牆/玄關分戶牆乾區複牆；含C40輕鋼骨架-封板',unit:'㎡',qty:43.72,price:140,amount:6120.8,remark:'',groupId:'gg',groupName:'床頭/電視牆/玄關分戶牆乾區複牆；含C40輕鋼骨架'}]}],
   periods:[{no:1,date:'2026-09-01',prog:{}}], curPeriod:0, createdAt:1 }
], cur:'p1', tab:'items'};

async function open(br){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},seed);
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1200);
  await p.evaluate(()=>{curProj().blocks.forEach(b=>openBlk.add(b.id));render();});
  await p.waitForTimeout(500);
  return {p,errs};
}
const boxes=p=>p.evaluate(()=>({name:!!document.querySelector('[data-gname]'),price:!!document.querySelector('[data-gprice]'),
  qty:!!document.querySelector('[data-gqty]')}));

(async()=>{
  const br=await chromium.launch();

  // ══ ① 平常是文字，不是一排輸入框 ══
  {
    const {p,errs}=await open(br);
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    const b=await boxes(p);
    ok(b.name===false,'★★ 名稱平常是文字，不是輸入框');
    ok(b.price===false,'★★ 單價平常也是文字');
    ok(b.qty===true,'★ 數量維持原本就有的輸入框（之前你習慣的那個）');
    const t=await p.evaluate(()=>document.body.innerText);
    ok(/床頭\/電視牆\/玄關分戶牆乾區複牆；含C40輕鋼骨架/.test(t),'★★ 長名稱完整顯示，不會被輸入框截掉');
    await p.close();
  }

  // ══ ② 點一下才變輸入框 ══
  {
    const {p}=await open(br);
    await p.click('[data-gedit="b1::gg::name"]'); await p.waitForTimeout(400);
    ok((await boxes(p)).name===true,'② 點名稱才出現輸入框');
    const focused=await p.evaluate(()=>document.activeElement&&document.activeElement.dataset.gname?true:false);
    ok(focused,'★★ 而且游標直接在裡面，點完就能打');
    await p.close();
  }

  // ══ ③ 改完存起來、收回文字 ══
  {
    const {p}=await open(br);
    await p.click('[data-gedit="b1::gg::name"]'); await p.waitForTimeout(400);
    await p.fill('[data-gname]','分戶牆複牆');
    await p.evaluate(()=>document.querySelector('[data-gname]').dispatchEvent(new Event('change',{bubbles:true})));
    await p.waitForTimeout(700);
    const r=await p.evaluate(()=>curProj().blocks[0].items.map(x=>x.name));
    ok(r[0]==='分戶牆複牆-骨架'&&r[1]==='分戶牆複牆-封板','③ 改好了（'+r.join('、')+'）');
    ok((await boxes(p)).name===false,'★★ 改完收回文字，不會一直掛著輸入框');
    await p.close();
  }

  // ══ ④ 單價一樣：點了才改，照比例分 ══
  {
    const {p}=await open(br);
    ok((await boxes(p)).price===false,'④ 單價平常是文字');
    await p.click('[data-gedit="b1::gg::price"]'); await p.waitForTimeout(400);
    ok((await boxes(p)).price===true,'★ 點了變輸入框');
    await p.fill('[data-gprice]','300');
    await p.evaluate(()=>document.querySelector('[data-gprice]').dispatchEvent(new Event('change',{bubbles:true})));
    await p.waitForTimeout(700);
    const pr=await p.evaluate(()=>curProj().blocks[0].items.map(x=>x.price));
    ok(pr[0]===150&&pr[1]===150,'★★ 280→300 分成 150／150');
    ok((await boxes(p)).price===false,'★ 收回文字');
    await p.close();
  }

  // ══ ⑤ 點開又沒改就走掉：自己收回去 ══
  {
    const {p}=await open(br);
    await p.click('[data-gedit="b1::gg::name"]'); await p.waitForTimeout(400);
    ok((await boxes(p)).name===true,'⑤ 先點開');
    await p.evaluate(()=>document.querySelector('[data-gname]').blur());
    await p.waitForTimeout(500);
    ok((await boxes(p)).name===false,'★★ 沒改就離開，輸入框自己收回去');
    await p.close();
  }

  // ══ ⑥ Esc 取消 ══
  {
    const {p}=await open(br);
    await p.click('[data-gedit="b1::gg::price"]'); await p.waitForTimeout(400);
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    ok((await boxes(p)).price===false,'⑥ 按 Esc 收回去');
    const pr=await p.evaluate(()=>curProj().blocks[0].items.map(x=>x.price));
    ok(pr[0]===140&&pr[1]===140,'★ 原值沒變');
    await p.close();
  }

  // ══ ⑦ 一次只開一格 ══
  {
    const {p}=await open(br);
    await p.click('[data-gedit="b1::gg::name"]'); await p.waitForTimeout(400);
    await p.click('[data-gedit="b1::gg::price"]'); await p.waitForTimeout(500);
    const b=await boxes(p);
    ok(b.price===true&&b.name===false,'⑦ 點另一格時前一格收回去，畫面不會一團輸入框');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
