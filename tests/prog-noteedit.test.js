const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

// gg：兩道工序，備註原本一樣；hh：兩道工序，備註不一樣（其中一道自己多寫了一句）
const seed={ projects:[
 { id:'p1', name:'某案', owner:'業主', vendor:'東澤', taxMode:'excl',
   blocks:[{id:'b1',name:'TYPE-SK',unit:'間',count:10,items:[
     {id:'g1',no:'6.1',tag:'',chapter:'內隔間',name:'床頭複牆-骨架',unit:'㎡',qty:43.72,price:140,amount:6120.8,remark:'TYPE-A管線層',groupId:'gg',groupName:'床頭複牆'},
     {id:'g2',no:'6.1',tag:'',chapter:'內隔間',name:'床頭複牆-封板',unit:'㎡',qty:43.72,price:140,amount:6120.8,remark:'TYPE-A管線層',groupId:'gg',groupName:'床頭複牆'},
     {id:'h1',no:'6.11',tag:'',chapter:'內隔間',name:'電視牆二次隔間-骨架',unit:'㎡',qty:16.18,price:140,amount:2265.2,remark:'TYPE-L',groupId:'hh',groupName:'電視牆二次隔間'},
     {id:'h2',no:'6.11',tag:'',chapter:'內隔間',name:'電視牆二次隔間-封板',unit:'㎡',qty:16.18,price:140,amount:2265.2,remark:'TYPE-L；含防火填塞',groupId:'hh',groupName:'電視牆二次隔間'},
     {id:'s1',no:'6.9',tag:'',chapter:'內隔間',name:'淋浴間壁龕單面壁板',unit:'㎡',qty:2.5,price:280,amount:700,remark:'TYPE-K.1'}]}],
   periods:[{no:1,date:'2026-09-01',prog:{}}], curPeriod:0, createdAt:1 }
], cur:'p1', tab:'items'};

async function open(br){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  const said=[]; p.on('dialog',d=>{said.push(d.message());d.accept();});
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},seed);
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1200);
  await p.evaluate(()=>{curProj().blocks.forEach(b=>openBlk.add(b.id));render();});
  await p.waitForTimeout(500);
  return {p,errs,said};
}
const R=p=>p.evaluate(()=>{const o={};curProj().blocks[0].items.forEach(x=>o[x.id]=x.remark);return o;});
const edit=async(p,token,sel,v)=>{ await p.click(`[data-gedit="${token}"]`); await p.waitForTimeout(350);
  await p.fill(sel,v);
  await p.evaluate(s=>document.querySelector(s).dispatchEvent(new Event('change',{bubbles:true})),sel);
  await p.waitForTimeout(700); };

(async()=>{
  const br=await chromium.launch();

  // ══ ① 一般細項的備註點一下就能改 ══
  {
    const {p,errs}=await open(br);
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    ok(!(await p.$('[data-inote]')),'★ 平常是文字，不是輸入框');
    await edit(p,'b1::s1::inote','[data-inote]','改成我要的備註');
    ok((await R(p)).s1==='改成我要的備註','★★ 一般細項的備註改好了');
    ok(!(await p.$('[data-inote]')),'★ 改完收回文字');
    await p.close();
  }

  // ══ ② 群組收合行的備註：兩道一起改 ══
  {
    const {p}=await open(br);
    await edit(p,'b1::gg::gnote','[data-gnote]','TYPE-A管線層／不含隔音測試');
    const r=await R(p);
    ok(r.g1==='TYPE-A管線層／不含隔音測試'&&r.g2===r.g1,'② 收合行改備註，兩道工序一起改');
    await p.close();
  }

  // ══ ③ 各道備註不一樣時先問一聲 ══
  {
    const {p,said}=await open(br);
    await edit(p,'b1::hh::gnote','[data-gnote]','統一備註');
    ok(said.some(m=>/備註原本不一樣/.test(m)),'★★ ③ 會先問，不會默默蓋掉');
    ok(said.some(m=>/含防火填塞/.test(m)),'★★ 而且把原本的內容列出來給你看');
    ok(said.some(m=>/展開 ▾ 點各道工序自己的備註/.test(m)),'★ 並告訴你想個別改要怎麼做');
    const r=await R(p);
    ok(r.h1==='統一備註'&&r.h2==='統一備註','★ 按確定就全部改成一樣');
    await p.close();
  }

  // ══ ④ 按取消就什麼都不動 ══
  {
    const {p}=await open(br);
    p.removeAllListeners('dialog');
    p.on('dialog',d=>d.dismiss());
    await edit(p,'b1::hh::gnote','[data-gnote]','統一備註');
    const r=await R(p);
    ok(/含防火填塞/.test(r.h2),'④ 按取消，原本的備註保住了');
    ok(r.h1==='TYPE-L','★ 另一道也沒動');
    await p.close();
  }

  // ══ ⑤ 展開後可以單獨改某一道工序的備註 ══
  {
    const {p}=await open(br);
    await p.evaluate(()=>{openGroup.add('hh');render();}); await p.waitForTimeout(400);
    await edit(p,'b1::h1::inote','[data-inote]','只改這道');
    const r=await R(p);
    ok(r.h1==='只改這道','⑤ 單獨改某一道工序');
    ok(/含防火填塞/.test(r.h2),'★★ 另一道的備註完全沒被動到');
    await p.close();
  }

  // ══ ⑥ 空備註顯示「—」，點了還是能填 ══
  {
    const {p}=await open(br);
    await p.evaluate(()=>{curProj().blocks[0].items.find(x=>x.id==='s1').remark='';save();render();
      curProj().blocks.forEach(b=>openBlk.add(b.id));render();});
    await p.waitForTimeout(400);
    const t=await p.evaluate(()=>document.body.innerText);
    ok(/—/.test(t),'⑥ 空備註顯示「—」，看得出那格可以點');
    await edit(p,'b1::s1::inote','[data-inote]','補上去');
    ok((await R(p)).s1==='補上去','★ 補得進去');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
