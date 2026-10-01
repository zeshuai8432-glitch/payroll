// 重作之前的保險：備份要含圖面、還原要回來、刪專案要清掉圖面垃圾
const {chromium}=require('playwright');
const path=require('path'), fs=require('fs'), os=require('os');
const FILE='file://'+path.resolve(__dirname,'../progress.html');
const ok=[],bad=[];
const t=(n,c)=>{(c?ok:bad).push(n);console.log((c?'✓ ':'✗ ')+n);};
const PNG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AVw==';

const seed=()=>({savedAt:Date.now(),tab:'items',cur:'A',projects:[
  {id:'A',name:'凱子-代工',taxMode:'excl',signedTotal:0,trash:[],periods:[],blocks:[
    {id:'bA',name:'TYPE-EXS',unit:'間',count:3,items:[
      {id:'i1',no:'6.1',name:'雙面隔間',unit:'㎡',qty:10,price:120,amount:1200}]}]},
  {id:'Z',name:'別的專案',taxMode:'excl',signedTotal:0,trash:[],periods:[],blocks:[
    {id:'bZ',name:'TYPE-K',unit:'間',count:1,items:[
      {id:'z1',no:'1.1',name:'天花',unit:'㎡',qty:5,price:100,amount:500}]}]}]});

(async()=>{
const br=await chromium.launch();
const open=async(st,dl)=>{
  const ctx=await br.newContext({acceptDownloads:true});
  const pg=await ctx.newPage();
  await pg.route('**/firestore.googleapis.com/**',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await pg.addInitScript(d=>localStorage.setItem('pm_progress_v1',JSON.stringify(d)),st);
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(900);
  return {pg,errs,ctx};
};
const addPlans=pg=>pg.evaluate(async d=>{
  await planAdd('A','bA','EXS平面圖',d);
  await planAdd('A','bA','EXS剖面',d);
  await planAdd('Z','bZ','K天花圖',d);
  return Object.keys(PLANS).length;
},PNG);

// ① 匯出備份要含圖面
let file='';
{
  const {pg,errs,ctx}=await open(seed());
  t('① 先放了 2 組圖面共 3 張', await addPlans(pg)===2);
  pg.on('dialog',async d=>{ await d.accept(); });   // 確定＝連圖面一起
  await pg.evaluate(()=>{ state.tab='set'; render(); }); await pg.waitForTimeout(300);
  const [dl]=await Promise.all([pg.waitForEvent('download'),pg.click('#backup-export')]);
  file=path.join(os.tmpdir(),'bk.json'); await dl.saveAs(file);
  const j=JSON.parse(fs.readFileSync(file,'utf8'));
  t('① 備份裡有 _plans', !!j._plans);
  t('① 三張圖都在', Object.keys(j._plans).reduce((a,k)=>a+j._plans[k].length,0)===3);
  t('① 圖面內容是真的帶出去（不是空殼）', (j._plans['A::bA']||[])[0].d===PNG);
  t('① 專案資料照舊', j.projects.length===2);
  t('① 沒有 JS 錯誤', errs.length===0);
  await ctx.close();
}

// ② 匯入要把圖面還原回來
{
  // 要有專案「設定/備份」分頁才會出現，所以放一個無關的，匯入會整份覆蓋掉
  const {pg,ctx}=await open({savedAt:1,tab:'set',cur:'X',projects:[
    {id:'X',name:'匯入前的舊資料',taxMode:'excl',signedTotal:0,periods:[],blocks:[]}]});
  t('② 新裝置上本來沒有圖面', await pg.evaluate(()=>Object.keys(PLANS).length)===0);
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.evaluate(()=>{ state.tab='set'; render(); }); await pg.waitForTimeout(300);
  await pg.setInputFiles('#backup-import',file); await pg.waitForTimeout(1500);
  const r=await pg.evaluate(()=>({pr:state.projects.length,pl:Object.keys(PLANS).length,
    n:Object.keys(PLANS).reduce((a,k)=>a+PLANS[k].length,0),first:(PLANS['A::bA']||[])[0]}));
  t('② 專案還原了（舊的被覆蓋）', r.pr===2&&!(await pg.evaluate(()=>state.projects.some(p=>p.id==='X'))));
  t('② 圖面也還原了（2 組 3 張）', r.pl===2&&r.n===3);
  t('② 圖面名稱沒掉', r.first&&r.first.name==='EXS平面圖');
  t('② 備份裡的 _plans 不會變成 state 的欄位', await pg.evaluate(()=>state._plans===undefined));
  // 重開一次：確認是真的寫進 IndexedDB，不只是記憶體
  await pg.reload(); await pg.waitForTimeout(1200);
  t('② 重開後圖面還在（真的寫進 IndexedDB）',
    await pg.evaluate(()=>Object.keys(PLANS).reduce((a,k)=>a+PLANS[k].length,0))===3);
  await ctx.close();
}

// ③ 刪專案要清掉它的圖面，而且不能動到別的專案
{
  const {pg,errs,ctx}=await open(seed());
  await addPlans(pg);
  pg.on('dialog',async d=>{ await d.accept(); });
  await pg.evaluate(()=>{ state.cur='A'; state.tab='set'; render(); }); await pg.waitForTimeout(300);
  await pg.click('#proj-del'); await pg.waitForTimeout(900);
  const r=await pg.evaluate(()=>({keys:Object.keys(PLANS),pr:state.projects.map(p=>p.id)}));
  t('③ 專案刪掉了', !r.pr.includes('A'));
  t('③ 它的圖面也清掉了', !r.keys.some(k=>k.startsWith('A::')));
  t('③ 別的專案圖面不受影響', r.keys.includes('Z::bZ'));
  await pg.reload(); await pg.waitForTimeout(1200);
  const r2=await pg.evaluate(()=>Object.keys(PLANS));
  t('③ 重開後確實從 IndexedDB 清掉了（不是只清記憶體）',
    !r2.some(k=>k.startsWith('A::'))&&r2.includes('Z::bZ'));
  t('③ 沒有 JS 錯誤', errs.length===0);
  await ctx.close();
}

await br.close();
try{fs.unlinkSync(file);}catch(e){}
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if(bad.length){bad.forEach(b=>console.log(' FAIL '+b));process.exit(1);}
})();
