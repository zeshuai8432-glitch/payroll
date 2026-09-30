const { chromium } = require('playwright');
let fail=0; const ok=(c,m)=>{console.log((c?'✓':'✗ FAIL')+' '+m); if(!c)fail++;};

const seed={sites:[{id:'s1',name:'鑫喆商旅'}],workers:[],attendance:[],measurements:[],
  billings:[],ledger:[],loans:[],tools:[],assets:[],advances:[]};

async function open(br){
  const p=await br.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',d=>{p._said=(p._said||[]).concat(d.message());d.accept();});
  await p.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.addInitScript(s=>{localStorage.setItem('pm_data_v2',JSON.stringify(s));},seed);
  await p.goto('file:///home/user/payroll/payroll.html'); await p.waitForTimeout(1200);
  // 切到計量明細並展開新增表單
  await p.evaluate(()=>{state.tab='meas';formOpen.meas=true;render();});
  await p.waitForTimeout(600);
  return {p,errs};
}
const V=(p,id)=>p.evaluate(i=>{const e=document.getElementById(i);return e?e.value:null;},id);
// 案場下拉第一個是空白提示，要挑到真的案場
const pickSite=p=>p.evaluate(()=>{const s=document.getElementById('meas-site');
  const o=[...s.options].find(x=>x.value&&x.value.trim()); if(o){s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));}
  return s.value;});

(async()=>{
  const br=await chromium.launch();

  // ══ ① 預設仍是自動算面積（原本的方便沒被拿掉）══
  {
    const {p,errs}=await open(br);
    ok(errs.length===0,'① JS 無錯誤'+(errs.length?'：'+errs[0]:''));
    const ro=await p.evaluate(()=>document.getElementById('meas-qty').readOnly);
    ok(ro===true,'★ 隔間＋㎡ 預設數量欄唯讀（自動算）');
    await p.fill('#meas-width','2.5'); await p.fill('#meas-height','3');
    await p.waitForTimeout(300);
    ok(await V(p,'meas-qty')==='7.5','★★ 寬 2.5 × 高 3 自動算出 7.5');
    await p.close();
  }

  // ══ ② 按「✎ 手動輸入」就能自己打 ══
  {
    const {p}=await open(br);
    const btn=await p.evaluate(()=>{const b=document.getElementById('meas-qty-manual');
      return b?{show:b.style.display!=='none',txt:b.textContent}:null;});
    ok(btn&&btn.show,'② 隔間＋㎡ 時「手動輸入」鈕看得到');
    ok(btn.txt.includes('手動輸入'),'★ 按鈕文字：'+btn.txt);

    await p.click('#meas-qty-manual'); await p.waitForTimeout(300);
    ok(await p.evaluate(()=>document.getElementById('meas-qty').readOnly)===false,'★★ 按下去之後數量欄可以打字了');
    const t2=await p.evaluate(()=>document.getElementById('meas-qty-manual').textContent);
    ok(t2.includes('改回自動'),'★ 按鈕變成「↻ 改回自動」：'+t2);

    await p.fill('#meas-qty','13.75'); await p.fill('#meas-price','1200');
    await p.waitForTimeout(300);
    const sub=await p.evaluate(()=>document.getElementById('meas-subtotal').textContent);
    ok(/16,500/.test(sub),'★★ 小計照手動的 13.75 × 1200 ＝ 16,500（實際 '+sub+'）');
    await p.close();
  }

  // ══ ③ 手動時不再強制寬高，存得進去 ══
  {
    const {p}=await open(br);
    await p.click('#meas-qty-manual'); await p.waitForTimeout(300);
    await pickSite(p);
    await p.fill('#meas-item','不規則牆面');
    await p.fill('#meas-qty','13.75');
    await p.fill('#meas-price','1200');
    await p.click('#meas-add'); await p.waitForTimeout(700);
    const m=await p.evaluate(()=>state.measurements[0]||null);
    ok(!!m,'③ 沒填寬高也存得進去（以前會被擋）');
    ok(m&&m.qty===13.75,'★★ 數量就是手動打的 13.75（實際 '+(m&&m.qty)+'）');
    ok(m&&m.qtyManual===true,'★★ 有記下「這筆是手動的」');
    ok(!(p._said||[]).some(x=>/請填寬度與高度/.test(x)),'★ 沒有跳出要寬高的警告');
    await p.close();
  }

  // ══ ④ 沒按手動又沒填寬高：照樣擋，而且告訴你可以按手動 ══
  {
    const {p}=await open(br);
    await pickSite(p);
    await p.fill('#meas-item','一般隔間');
    await p.fill('#meas-price','1200');
    await p.click('#meas-add'); await p.waitForTimeout(600);
    const said=(p._said||[]).join('\n');
    ok(/請填寬度與高度/.test(said),'④ 自動模式沒填寬高照樣擋');
    ok(/✎ 手動輸入/.test(said),'★★ 而且提示可以按「✎ 手動輸入」自己打');
    ok(await p.evaluate(()=>state.measurements.length)===0,'★ 沒有存進去');
    await p.close();
  }

  // ══ ⑤ 「↻ 改回自動」會回到寬高計算 ══
  {
    const {p}=await open(br);
    await p.click('#meas-qty-manual'); await p.waitForTimeout(250);
    await p.fill('#meas-qty','99'); await p.waitForTimeout(250);
    await p.click('#meas-qty-manual'); await p.waitForTimeout(250);
    ok(await p.evaluate(()=>document.getElementById('meas-qty').readOnly)===true,'⑤ 改回自動後數量欄又唯讀');
    await p.fill('#meas-width','2'); await p.fill('#meas-height','2'); await p.waitForTimeout(300);
    ok(await V(p,'meas-qty')==='4','★★ 手打的 99 被清掉，改用 2×2＝4');
    await p.close();
  }

  // ══ ⑥ 其他單位（非㎡）完全不受影響 ══
  {
    const {p}=await open(br);
    await p.fill('#meas-unit','工'); await p.waitForTimeout(300);
    ok(await p.evaluate(()=>document.getElementById('meas-qty').readOnly)===false,'⑥ 單位改「工」本來就能打，維持原樣');
    const show=await p.evaluate(()=>document.getElementById('meas-qty-manual').style.display);
    ok(show==='none','★ 非㎡ 時不會多出用不到的手動鈕');
    await p.close();
  }

  // ⑦ 手動存好的那筆，之後複製／編輯不會又被自動算回去
  {
    const {p}=await open(br);
    await p.click('#meas-qty-manual'); await p.waitForTimeout(250);
    await pickSite(p);
    await p.fill('#meas-item','不規則牆面');
    await p.fill('#meas-qty','13.75'); await p.fill('#meas-price','1200');
    await p.click('#meas-add'); await p.waitForTimeout(700);
    // 模擬把那筆帶回表單（複製／編輯）
    await p.evaluate(()=>{ measDraft={...state.measurements[0]}; formOpen.meas=true; render(); });
    await p.waitForTimeout(600);
    const r=await p.evaluate(()=>({qty:document.getElementById('meas-qty').value,
      ro:document.getElementById('meas-qty').readOnly,
      btn:document.getElementById('meas-qty-manual').textContent}));
    ok(r.qty==='13.75','⑦ 帶回表單時數量還是 13.75（沒被清成自動）實際 '+r.qty);
    ok(r.ro===false,'★★ 仍然是可以打字的狀態');
    ok(/改回自動/.test(r.btn),'★ 按鈕維持在手動模式');
    const lbl=await p.evaluate(()=>{const m=state.measurements[0];return measurementSizeLabel(m);});
    ok(lbl==='手動輸入','★ 清單的尺寸欄標「手動輸入」，不會看起來像漏填（實際 '+lbl+'）');
    await p.close();
  }

  await br.close();
  console.log(fail?`\n${fail} 項失敗`:'\n全部通過');
  process.exit(fail?1:0);
})();
