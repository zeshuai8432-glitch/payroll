const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

const seed={ projects:[
 { id:'m1', name:'鑫喆商旅', owner:'鑫喆', vendor:'東澤', taxMode:'excl', signedTotal:700000,
   blocks:[{id:'mb1',name:'TYPE-SK',unit:'間',count:12,items:[
     {id:'ma',no:'6.1',name:'骨架',unit:'㎡',qty:40,price:1000,amount:40000,remark:''},
     {id:'mg1',no:'6.2',name:'複牆-立料',unit:'㎡',qty:10,price:300,amount:3000,remark:'',groupId:'gg',groupName:'複牆'},
     {id:'mg2',no:'6.2',name:'複牆-封板',unit:'㎡',qty:10,price:200,amount:2000,remark:'',groupId:'gg',groupName:'複牆'}]}],
   periods:[{no:1,date:'2026-09-01',prog:{ma:{p:0.5,q:240}}}], curPeriod:0, createdAt:1 },
 { id:'kA', parentId:'m1', name:'鑫喆商旅-鑫', vendor:'鑫', taxMode:'excl',
   blocks:[{id:'ab1',name:'TYPE-SK',unit:'間',count:12,srcBlk:'mb1',items:[
     {id:'aa',no:'6.1',name:'骨架',unit:'㎡',qty:40,price:700,amount:28000,remark:'',srcId:'ma'},
     {id:'ag1',no:'6.2',name:'複牆-立料',unit:'㎡',qty:10,price:220,amount:2200,remark:'',srcId:'mg1',groupId:'ag',groupName:'複牆'},
     {id:'ag2',no:'6.2',name:'複牆-封板',unit:'㎡',qty:10,price:150,amount:1500,remark:'',srcId:'mg2',groupId:'ag',groupName:'複牆'}]}],
   periods:[{no:1,date:'2026-09-01',prog:{aa:{p:0.5,q:240}},settled:168000},
            {no:2,date:'2026-09-20',prog:{aa:{p:0.25,q:120}}}],
   curPeriod:1, createdAt:2 },
 { id:'kB', parentId:'m1', name:'鑫喆商旅-華', vendor:'華', taxMode:'excl',
   blocks:[], periods:[], curPeriod:0, createdAt:3 }
], cur:'kA', tab:'items'};

(async()=>{
  const br=await chromium.launch(); const p=await br.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},seed);
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1300);
  ok(errs.length===0,'開頁無 JS 錯誤'+(errs.length?'：'+errs[0]:''));

  // 四個分頁都渲染得出來
  for(const [tab,mark] of [['items','合約總額'],['prog','本次實請金額'],['set','簽約總價'],['alloc','發包']]){
    await p.evaluate(t=>{state.tab=t;render();curProj().blocks.forEach(b=>openBlk.add(b.id));
      curProj().blocks.forEach(b=>b.items.forEach(i=>{if(i.groupId)openGroup.add(i.groupId);}));render();},tab);
    await p.waitForTimeout(400);
    const t=await p.evaluate(()=>document.body.innerText);
    ok(t.length>200,`分頁 ${tab} 有內容`);
  }
  ok(errs.length===0,'切換分頁無 JS 錯誤'+(errs.length?'：'+errs[0]:''));

  // 對帳檢查面板
  await p.evaluate(()=>{state.tab='prog';render();}); await p.waitForTimeout(500);
  const rt=await p.evaluate(()=>{const el=document.querySelector('#recon-panel');return el?el.innerText:'';});
  ok(/對帳檢查/.test(rt),'對帳檢查面板在');

  // 填進度（局部更新路徑）
  await p.evaluate(()=>{curProj().blocks.forEach(b=>openBlk.add(b.id));render();}); await p.waitForTimeout(400);
  await p.fill('[data-r="ab1::aa"]','4');
  await p.evaluate(()=>document.querySelector('[data-r="ab1::aa"]').dispatchEvent(new Event('change',{bubbles:true})));
  await p.waitForTimeout(700);
  const pr=await p.evaluate(()=>({p:curProj().periods[1].prog.aa?curProj().periods[1].prog.aa.p:null,
    cur:state.cur, val:document.querySelector('[data-r="ab1::aa"]')?document.querySelector('[data-r="ab1::aa"]').value:null,
    curPeriod:curProj().curPeriod, nper:curProj().periods.length}));
  console.log('   debug:',JSON.stringify(pr));
  ok(Math.abs(pr.p-4/12)<1e-6,'填完成間數 4 → 4/12');
  ok(await p.evaluate(()=>calc(curProj(),0).billActual)===168000,'★ 第 1 期已鎖定，填進度不會動到它');

  // 工序子列轉出（拆開的也要有）
  await p.evaluate(()=>{state.tab='items';render();curProj().blocks.forEach(b=>openBlk.add(b.id));
    curProj().blocks.forEach(b=>b.items.forEach(i=>{if(i.groupId)openGroup.add(i.groupId);}));render();});
  await p.waitForTimeout(500);
  ok(!!(await p.$('[data-xfer="ab1::ag1"]')),'拆開的工序子列有「轉出」');
  await p.click('[data-xfer="ab1::ag1"]'); await p.waitForTimeout(500);
  await p.fill('#xf-move','4'); await p.selectOption('#xf-to','kB');
  await p.click('[data-xferok="ab1::ag1"]'); await p.waitForTimeout(900);
  const x=await p.evaluate(()=>{const A=state.projects.find(v=>v.id==='kA'),B=state.projects.find(v=>v.id==='kB');
    return {a:effCount(A.blocks[0].items.find(i=>i.id==='ag1'),A.blocks[0]),
            b:B.blocks[0]?effCount(B.blocks[0].items[0],B.blocks[0]):null};});
  ok(x.a===8&&x.b===4,'工序轉出 4 間：鑫剩 8、華拿 4（實際 '+x.a+'/'+x.b+'）');

  // 發包分配以量為準
  await p.evaluate(()=>{state.cur='m1';state.tab='alloc';render();}); await p.waitForTimeout(600);
  const al=await p.evaluate(()=>{const a=allocationOf(state.projects.find(v=>v.id==='m1'));
    return {over:a.over,totCost:Math.round(a.totCost),totAlloc:Math.round(a.totAlloc)};});
  ok(al.over===0,'發包分配沒有假超額');
  ok(al.totCost>0&&al.totAlloc>0,'已發包（母價）與實際成本都算得出來');

  ok(errs.length===0,'全程無 JS 錯誤'+(errs.length?'：'+errs[0]:''));
  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
