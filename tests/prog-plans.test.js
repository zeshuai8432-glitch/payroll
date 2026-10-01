const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

const seed={ projects:[
 { id:'p1', name:'鑫喆商旅', owner:'鑫喆', vendor:'東澤', taxMode:'excl',
   blocks:[
     {id:'b1',name:'TYPE-SK 標準大床',unit:'間',count:22,items:[
       {id:'i1',no:'6.1',tag:'',chapter:'內隔間',name:'床頭複牆',unit:'㎡',qty:43.72,price:30,amount:1311.6,remark:''}]},
     {id:'b2',name:'TYPE-DD 標準雙床',unit:'間',count:17,items:[
       {id:'i2',no:'7.1',tag:'',chapter:'內隔間',name:'分戶牆',unit:'㎡',qty:20,price:40,amount:800,remark:''}]}],
   periods:[{no:1,date:'2026-10-01',prog:{i1:{p:1,q:43.72*22},i2:{p:1,q:20*17}}}],
   curPeriod:0, createdAt:1 }
], cur:'p1', tab:'prog'};

async function open(br){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_progress_v1',JSON.stringify(s));localStorage.setItem('pm_e2e_key_v1','x');},seed);
  await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1200);
  return {p,errs};
}
const addPlan=(p,blk,name)=>p.evaluate(async([b,n])=>await planAdd('p1',b,n,'data:image/jpeg;base64,'+'A'.repeat(2000)),[blk,name]);
const openPrint=async p=>{ await p.evaluate(()=>{window.print=function(){};});
  await p.click('#btn-print'); await p.waitForTimeout(900); };

(async()=>{
  const br=await chromium.launch();

  // ══ ① 圖面不會跑進要同步的那份資料 ══
  {
    const {p,errs}=await open(br);
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    await addPlan(p,'b1','SK平面圖.jpg');
    const r=await p.evaluate(()=>({
      inState:JSON.stringify(state).includes('data:image/jpeg'),
      inPlans:planList('p1','b1').length,
      lsAll:Object.keys(localStorage).some(k=>String(localStorage.getItem(k)).includes('data:image/jpeg')),
      stateKey:localStorage.getItem('pm_progress_v1').includes('data:image/jpeg')}));
    ok(r.inPlans===1,'★ 圖面存進本機的圖面區');
    ok(r.lsAll===false,'★★ localStorage 裡完全沒有圖片——不會排擠到主資料的空間');
    ok(r.inState===false&&r.stateKey===false,'★★ 專案資料裡完全沒有圖片——不會把雲端那 1MB 額度吃掉');
    await p.close();
  }

  // ══ ② 列印時接在「那個房型」的明細後面 ══
  {
    const {p}=await open(br);
    await addPlan(p,'b1','SK平面圖.jpg');
    await addPlan(p,'b2','DD平面圖.jpg');
    await openPrint(p);
    const r=await p.evaluate(()=>{
      const t=document.querySelector('#print-overlay .pcontent').innerText.replace(/\s+/g,' ');
      return {iSK:t.indexOf('TYPE-SK 標準大床 圖面 1／1'),
              iDD:t.indexOf('TYPE-DD 標準雙床 圖面 1／1'),
              iDDrow:t.indexOf('分戶牆'),
              imgs:document.querySelectorAll('#print-overlay .pcontent img').length};});
    ok(r.imgs>=2,'② 兩張圖都印出來了（實際 '+r.imgs+' 張）');
    ok(r.iSK>-1&&r.iDD>-1,'★ 兩個房型各自標了「圖面 1／1」');
    ok(r.iSK<r.iDDrow&&r.iDDrow<r.iDD,
       '★★ SK 的圖在 SK 明細之後、DD 明細之前——確實按房型穿插（'+[r.iSK,r.iDDrow,r.iDD].join('<')+'）');
    await p.close();
  }

  // ══ ③ 一張一頁 ══
  {
    const {p}=await open(br);
    await addPlan(p,'b1','圖1'); await addPlan(p,'b1','圖2');
    await openPrint(p);
    const r=await p.evaluate(()=>{
      const d=[...document.querySelectorAll('#print-overlay .pcontent div')]
        .filter(x=>/page-break-before:\s*always/.test(x.getAttribute('style')||''));
      return {breaks:d.length,label:d[1]?d[1].textContent.replace(/\s+/g,' ').trim():''};});
    ok(r.breaks===2,'③ 兩張圖各自強制換頁');
    ok(/圖面 2／2/.test(r.label),'★ 標了第幾張／共幾張');
    await p.close();
  }

  // ══ ④ 沒附圖的房型不會多出空頁 ══
  {
    const {p}=await open(br);
    await addPlan(p,'b1','只有SK有圖');
    await openPrint(p);
    const n=await p.evaluate(()=>[...document.querySelectorAll('#print-overlay .pcontent div')]
      .filter(x=>/page-break-before:\s*always/.test(x.getAttribute('style')||'')).length);
    ok(n===1,'④ 只有附圖的房型會換頁，另一個不會多出空白頁');
    await p.close();
  }

  // ══ ⑤ 管理視窗 ══
  {
    const {p}=await open(br);
    await addPlan(p,'b1','SK平面圖.jpg');
    await openPrint(p);
    const btn=await p.evaluate(()=>{const b=document.getElementById('plan-manage');return b?b.textContent.trim():null;});
    ok(/圖面（1）/.test(btn||''),'⑤ 列印預覽有「🖼 圖面（1）」：'+btn);
    await p.click('#plan-manage'); await p.waitForTimeout(500);
    const t=await p.evaluate(()=>{const m=document.getElementById('modal');return m?m.innerText.replace(/\s+/g,' '):'';});
    ok(/只存在這台瀏覽器，不會同步到雲端/.test(t),'★★ 明確標示不會同步');
    ok(/1MB 上限/.test(t),'★ 並說明為什麼不放雲端');
    ok(/TYPE-SK 標準大床/.test(t)&&/TYPE-DD 標準雙床/.test(t),'★ 每個房型各自附圖');
    await p.evaluate(async()=>{await planDel('p1','b1',0);});
    ok((await p.evaluate(()=>planList('p1','b1').length))===0,'★ 刪得掉');
    await p.close();
  }

  // ══ ⑥ 本機空間滿時要講，不要默默失敗 ══
  {
    const {p}=await open(br);
    const said=await p.evaluate(()=>{
      const msgs=[]; const realAlert=window.alert; window.alert=m=>msgs.push(m);
      const real=localStorage.setItem.bind(localStorage);
      localStorage.setItem=(k,v)=>{ if(k==='pm_progress_v1') throw new Error('QuotaExceeded'); return real(k,v); };
      try{ save(); }catch(e){ msgs.push('EXCEPTION:'+e.message); }
      localStorage.setItem=real; window.alert=realAlert; return msgs;});
    ok(said.some(m=>/瀏覽器空間滿了/.test(m)),'⑥ 空間滿時會跳出說明');
    ok(!said.some(m=>/^EXCEPTION/.test(m)),'★★ 例外不會往外丟、打斷後面的流程');
    await p.close();
  }

  // ══ ⑦ 目前只收圖片，PDF 會擋並說明 ══
  {
    const {p}=await open(br);
    const acc=await p.evaluate(async()=>{
      await openPlanModal(state.projects[0],null);
      const inp=document.querySelector('#modal input[type=file]');
      return inp?inp.accept:null;});
    ok(/image\/\*/.test(acc||'')&&/application\/pdf/.test(acc||''),'⑦ 檔案挑選器收圖片也收 PDF（accept='+acc+'）');
    const err=await p.evaluate(async()=>{
      try{ await pdfToImages(new File([new Uint8Array([37,80,68,70])],'圖面.pdf',{type:'application/pdf'})); return null; }
      catch(e){ return e.message; }});
    ok(/連不到 pdf.js/.test(err||''),'★★ 載不到 pdf.js 時訊息講得清楚（離線時請先轉成圖片）：'+err);
    await p.close();
  }

  // ⑧ 舊版存在 localStorage 的圖面，開檔時搬到 IndexedDB 並清掉舊的
  {
    const p=await br.newPage(); p.on('dialog',d=>d.accept());
    await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
    await p.addInitScript(s=>{
      localStorage.setItem('pm_progress_v1',JSON.stringify(s));
      localStorage.setItem('pm_e2e_key_v1','x');
      localStorage.setItem('pm_progress_plans_v1',JSON.stringify({'p1::b1':[{name:'舊版的圖',d:'data:image/jpeg;base64,'+'B'.repeat(500),at:1}]}));
    },seed);
    await p.goto('file:///home/user/payroll/progress.html'); await p.waitForTimeout(1600);
    const r=await p.evaluate(()=>({n:planList('p1','b1').length,
      nm:(planList('p1','b1')[0]||{}).name,
      oldGone:localStorage.getItem('pm_progress_plans_v1')===null}));
    ok(r.n===1&&r.nm==='舊版的圖','⑧ 舊版 localStorage 的圖面自動搬到 IndexedDB');
    ok(r.oldGone,'★★ 搬完把 localStorage 那份清掉，不再佔主資料的空間');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
