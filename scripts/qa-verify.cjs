const { chromium } = require('playwright');
const BASE='http://localhost:5273', KEY='world_connection_journey.save.v1';
const ROUTES=[['타이틀','#/'],['지도','#/map'],['아메리카','#/mission/americas'],['유럽','#/mission/europe'],['아프리카','#/mission/africa'],['아시아','#/mission/asia'],['오세아니아','#/mission/oceania'],['스테이지6','#/mission/respect-dialogue'],['완주','#/completion']];
const save=()=>{const d=e=>({status:'completed',checkpointId:null,bestScore:80,attempts:1,completedAt:new Date().toISOString(),scoreDimensions:{},data:e||{}});return{schemaVersion:1,profile:{nickname:'바다',createdAt:new Date().toISOString(),avatarId:'a1',airplaneId:'plane1'},teacherUnlocked:true,missions:{asia:d(),europe:d(),africa:d(),americas:d(),oceania:d(),dialogue:{status:'available',checkpointId:null,bestScore:0,attempts:0,completedAt:null,scoreDimensions:{},data:{}}},stamps:['asia','europe','africa','americas','oceania'],settings:{bgm:false,sfx:false,reducedMotion:true,volume:0},completion:{unlocked:true,reflection:'',placedPuzzlePieceIds:[],reflectionDrafts:{initialThought:'',evidenceLearned:'',revisedThought:'',transferApplication:''},actionPrinciples:[],certificateIssued:false},rewardClaimedById:{},lastRoute:'#/map',updatedAt:new Date().toISOString()}};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1366,height:768}});
 await ctx.addInitScript(a=>{try{localStorage.setItem(a.k,JSON.stringify(a.s))}catch{}},{k:KEY,s:save()});
 const p=await ctx.newPage();
 for(const [n,r] of ROUTES){
   await p.goto(BASE+'/'+r,{waitUntil:'domcontentloaded'});await p.waitForTimeout(2200);
   const info=await p.evaluate(()=>({hash:location.hash,btns:document.querySelectorAll('button').length,imgs:document.querySelectorAll('img').length,txt:(document.body.innerText||'').replace(/\s+/g,' ').trim().slice(0,50),modal:!!document.querySelector('.modal')}));
   console.log(n.padEnd(8),'| hash',info.hash.padEnd(28),'btn',String(info.btns).padStart(3),'img',String(info.imgs).padStart(3),'modal',info.modal?'Y':'N','|',info.txt);
 }
 await b.close();
})().catch(e=>console.log('ERR',String(e).slice(0,200)));
