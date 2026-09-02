const { chromium } = require('playwright');
const BASE='http://localhost:5273', KEY='world_connection_journey.save.v1';
const save=()=>{const d=e=>({status:'completed',checkpointId:null,bestScore:80,attempts:1,completedAt:new Date().toISOString(),scoreDimensions:{},data:e||{}});return{schemaVersion:1,profile:{nickname:'바다',createdAt:new Date().toISOString(),avatarId:'a1',airplaneId:'plane1'},teacherUnlocked:true,missions:{asia:d(),europe:d(),africa:d(),americas:d(),oceania:d(),dialogue:{status:'available',checkpointId:null,bestScore:0,attempts:0,completedAt:null,scoreDimensions:{},data:{}}},stamps:['asia','europe','africa','americas','oceania'],settings:{bgm:false,sfx:false,reducedMotion:true,volume:0},completion:{unlocked:true,reflection:'',placedPuzzlePieceIds:[],reflectionDrafts:{initialThought:'',evidenceLearned:'',revisedThought:'',transferApplication:''},actionPrinciples:[],certificateIssued:false},rewardClaimedById:{},lastRoute:'#/map',updatedAt:new Date().toISOString()}};
(async()=>{
 const b=await chromium.launch();
 // 1) 모바일 가로: 겹침·작은터치 요소의 실제 정체
 let ctx=await b.newContext({viewport:{width:844,height:390}});
 await ctx.addInitScript(a=>{try{localStorage.setItem(a.k,JSON.stringify(a.s))}catch{}},{k:KEY,s:save()});
 let p=await ctx.newPage();
 for(const [n,r] of [['아메리카','#/mission/americas'],['스테이지6','#/mission/respect-dialogue']]){
  await p.goto(BASE+'/'+r,{waitUntil:'domcontentloaded'});await p.waitForTimeout(2200);
  for(let i=0;i<4;i++){const btn=await p.$('.modal-actions button');if(!btn)break;try{await btn.click({timeout:800})}catch{break}await p.waitForTimeout(400)}
  const info=await p.evaluate(()=>{
    const guide=document.querySelector('.guide-mascot-button, .guide-mascot, .guide-wrap');
    const gcs=guide?getComputedStyle(guide):null;
    const small=[...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.height>1&&r.height<40}).slice(0,3)
      .map(e=>({cls:e.className.toString().slice(0,50),h:Math.round(e.getBoundingClientRect().height),parent:e.parentElement?.className.toString().slice(0,40),inOverlay:!!e.closest('#overlay-root')}));
    return {guideCls:guide?guide.className.toString():'none', guideDisplay:gcs?gcs.display:'-', guideRect:guide?{w:Math.round(guide.getBoundingClientRect().width),h:Math.round(guide.getBoundingClientRect().height)}:null, small};
  });
  console.log('==',n,JSON.stringify(info,null,1));
 }
 await ctx.close();
 // 2) 전자칠판: 빈 여백 패널의 내부 구조
 ctx=await b.newContext({viewport:{width:1920,height:1080}});
 await ctx.addInitScript(a=>{try{localStorage.setItem(a.k,JSON.stringify(a.s))}catch{}},{k:KEY,s:save()});
 p=await ctx.newPage();
 for(const [n,r,sel] of [['유럽','#/mission/europe','.eu-bag'],['아시아','#/mission/asia','.regional-side']]){
  await p.goto(BASE+'/'+r,{waitUntil:'domcontentloaded'});await p.waitForTimeout(2200);
  for(let i=0;i<4;i++){const btn=await p.$('.modal-actions button');if(!btn)break;try{await btn.click({timeout:800})}catch{break}await p.waitForTimeout(400)}
  const info=await p.evaluate((sel)=>{const el=document.querySelector(sel);if(!el)return{missing:sel};
    return {h:Math.round(el.getBoundingClientRect().height), kids:[...el.children].map(c=>c.className.toString().slice(0,32)+':'+Math.round(c.getBoundingClientRect().height))};},sel);
  console.log('==',n,sel,JSON.stringify(info));
 }
 await b.close();
})().catch(e=>console.log('ERR',String(e).slice(0,200)));
// 추가 진단: 모바일 가로 스테이지6/완주의 세로 넘침 원인
const { chromium: c2 } = require('playwright');
(async()=>{
 const KEY2='world_connection_journey.save.v1';
 const save2=()=>{const d=e=>({status:'completed',checkpointId:null,bestScore:80,attempts:1,completedAt:new Date().toISOString(),scoreDimensions:{},data:e||{}});return{schemaVersion:1,profile:{nickname:'바다',createdAt:new Date().toISOString(),avatarId:'a1',airplaneId:'plane1'},teacherUnlocked:true,missions:{asia:d(),europe:d(),africa:d(),americas:d(),oceania:d(),dialogue:{status:'available',checkpointId:null,bestScore:0,attempts:0,completedAt:null,scoreDimensions:{},data:{}}},stamps:['asia','europe','africa','americas','oceania'],settings:{bgm:false,sfx:false,reducedMotion:true,volume:0},completion:{unlocked:true,reflection:'',placedPuzzlePieceIds:[],reflectionDrafts:{initialThought:'',evidenceLearned:'',revisedThought:'',transferApplication:''},actionPrinciples:[],certificateIssued:false},rewardClaimedById:{},lastRoute:'#/map',updatedAt:new Date().toISOString()}};
 const b=await c2.launch();const ctx=await b.newContext({viewport:{width:844,height:390}});
 await ctx.addInitScript(a=>{try{localStorage.setItem(a.k,JSON.stringify(a.s))}catch{}},{k:KEY2,s:save2()});
 const p=await ctx.newPage();
 for(const [n,r] of [['스테이지6','#/mission/respect-dialogue']]){
  await p.goto('http://localhost:5273/'+r,{waitUntil:'domcontentloaded'});await p.waitForTimeout(2200);
  for(let i=0;i<4;i++){const btn=await p.$('.modal-actions button');if(!btn)break;try{await btn.click({timeout:800})}catch{break}await p.waitForTimeout(400)}
  const info=await p.evaluate(()=>{const b=document.querySelector('.page-body');if(!b)return{no:1};
   return{bodyH:b.clientHeight,scrollH:b.scrollHeight,kids:[...b.children].map(c=>c.className.toString().slice(0,26)+':'+Math.round(c.getBoundingClientRect().height)),
   deep:[...b.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().height>150).slice(0,6).map(e=>e.className.toString().slice(0,30)+':'+Math.round(e.getBoundingClientRect().height))};});
  console.log('== 모바일',n,JSON.stringify(info));
 }
 await b.close();
})().catch(e=>console.log('ERR2',String(e).slice(0,150)));
