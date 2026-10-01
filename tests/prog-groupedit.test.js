const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

// 一條拆成「骨架 140」「封板 140」兩道工序，數量都是 43.72
const seed={ projects:[
 { id:'p1', name:'某案', owner:'業主', vendor:'東澤', taxMode:'excl',
   blocks:[{id:'b1',name:'TYPE-A',unit:'間',count:10,items:[
     {id:'g1',no:'6.1',tag:'',chapter:'內隔間及門扇工程',name:'床頭複牆-骨架',unit:'㎡',qty:43.72,price:140,amount:6120.8,remark:'',groupId:'gg',groupName:'床頭複牆'},
     {id:'g2',no:'6.1',tag:'',chapter:'內隔間及門扇工程',name:'床頭複牆-封板',unit:'㎡',qty:43.72,price:140,amount:6120.8,remark:'',groupId:'gg',groupName:'床頭複牆'},
     {id:'s1',no:'6.9',tag:'',chapter:'內隔間及門扇工程',name:'短牆',unit:'㎡',qty:5,price:300,amount:1500,remark:''}]}],
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
const G=p=>p.evaluate(()=>{const b=curProj().blocks[0];
  const subs=b.items.filter(x=>x.groupId==='gg');
  return {names:subs.map(x=>x.name),groupName:subs[0]&&subs[0].groupName,
          prices:subs.map(x=>x.price),qtys:subs.map(x=>x.qty),amts:subs.map(x=>x.amount)};});
// 名稱／單價現在是「點一下才變輸入框」，所以要先點開
const fire=async(p,sel,v)=>{
  const f=/gname/.test(sel)?'name':(/gprice/.test(sel)?'price':null);
  if(f){ await p.click(`[data-gedit="b1::gg::${f}"]`); await p.waitForTimeout(350); }
  await p.fill(sel,v);
  await p.evaluate(s=>document.querySelector(s).dispatchEvent(new Event('change',{bubbles:true})),sel);
  await p.waitForTimeout(700); };

(async()=>{
  const br=await chromium.launch();

  // ══ ① 收合那行就能改名稱，不用先合回 ══
  {
    const {p,errs}=await open(br);
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    ok(!!(await p.$('[data-gedit="b1::gg::name"]')),'★★ 收合那行的名稱點一下就能改');
    ok(!!(await p.$('[data-gedit="b1::gg::price"]')),'★★ 單價也是');
    ok(!!(await p.$('[data-gqty="b1::gg"]')),'★ 數量維持原本的輸入框');
    ok(!(await p.$('[data-gname]')),'★★ 平常不是輸入框（畫面才不會變成一排框）');

    await fire(p,'[data-gname="b1::gg"]','分戶牆複牆');
    const g=await G(p);
    ok(g.groupName==='分戶牆複牆','★★ 整組名稱改掉了');
    ok(g.names[0]==='分戶牆複牆-骨架'&&g.names[1]==='分戶牆複牆-封板',
       '★★ 兩道工序的前綴一起換，工序名保留（'+g.names.join('、')+'）');
    await p.close();
  }

  // ══ ② 單價照原比例分回去 ══
  {
    const {p}=await open(br);
    await fire(p,'[data-gprice="b1::gg"]','300');   // 原本 140+140
    const g=await G(p);
    ok(g.prices[0]===150&&g.prices[1]===150,'② 280→300：平均分成 150／150（原本一樣）');
    ok(Math.abs(g.amts[0]-43.72*150)<0.01,'★ 金額跟著重算');
    await p.close();
  }

  // ══ ③ 原本比例不同時，照比例分 ══
  {
    const {p}=await open(br);
    await p.evaluate(()=>{const b=curProj().blocks[0];
      b.items[0].price=100;b.items[0].amount=43.72*100;
      b.items[1].price=200;b.items[1].amount=43.72*200;save();render();
      curProj().blocks.forEach(x=>openBlk.add(x.id));render();});
    await p.waitForTimeout(400);
    await fire(p,'[data-gprice="b1::gg"]','330');   // 300 → 330，比例 1:2
    const g=await G(p);
    ok(g.prices[0]===110&&g.prices[1]===220,'③ 100:200 的比例 → 330 分成 110／220（實際 '+g.prices.join('／')+'）');
    ok(g.prices[0]+g.prices[1]===330,'★★ 加起來剛好等於你填的 330');
    await p.close();
  }

  // ══ ④ 零頭由最後一道吸收，總和不會差 ══
  {
    const {p}=await open(br);
    await p.evaluate(()=>{const b=curProj().blocks[0];
      b.items[0].price=1;b.items[1].price=2;save();render();
      curProj().blocks.forEach(x=>openBlk.add(x.id));render();});
    await p.waitForTimeout(400);
    await fire(p,'[data-gprice="b1::gg"]','100');   // 1:2 → 33.33 / 66.67
    const g=await G(p);
    ok(Math.abs(g.prices[0]+g.prices[1]-100)<0.001,'④ 除不盡時加起來仍剛好 100（'+g.prices.join('＋')+'）');
    await p.close();
  }

  // ══ ⑤ 數量照舊可改，且已請的錢不會被追溯改掉 ══
  {
    const {p}=await open(br);
    await p.evaluate(()=>{curProj().periods[0].prog={g1:{p:0.5,q:43.72*5},g2:{p:0.5,q:43.72*5}};save();render();
      curProj().blocks.forEach(x=>openBlk.add(x.id));render();});
    await p.waitForTimeout(400);
    const before=await p.evaluate(()=>calc(curProj(),0).blocks[0].items.filter(x=>x.it.groupId==='gg').reduce((a,x)=>a+x.cumAmt,0));
    await fire(p,'[data-gqty="b1::gg"]','50');
    const g=await G(p);
    ok(g.qtys[0]===50&&g.qtys[1]===50,'⑤ 數量兩道一起改成 50');
    const after=await p.evaluate(()=>calc(curProj(),0).blocks[0].items.filter(x=>x.it.groupId==='gg').reduce((a,x)=>a+x.cumAmt,0));
    ok(Math.abs(after-before)<1,'★★ 已登錄的完成金額沒被追溯改掉（'+Math.round(before)+'→'+Math.round(after)+'）');
    await p.close();
  }

  // ══ ⑥ 空白名稱擋下來 ══
  {
    const {p}=await open(br);
    const said=[]; p.removeAllListeners('dialog');
    p.on('dialog',d=>{said.push(d.message());d.accept();});
    await fire(p,'[data-gname="b1::gg"]','   ');
    ok(said.some(m=>/名稱不能空白/.test(m)),'⑥ 名稱清空會擋');
    ok((await G(p)).groupName==='床頭複牆','★ 原名保留');
    await p.close();
  }

  // ══ ⑦ 沒拆的那條不受影響 ══
  {
    const {p}=await open(br);
    await fire(p,'[data-gname="b1::gg"]','改過的名字');
    const other=await p.evaluate(()=>curProj().blocks[0].items.find(x=>x.id==='s1'));
    ok(other.name==='短牆'&&other.price===300,'⑦ 沒拆的「短牆」完全沒被動到');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
