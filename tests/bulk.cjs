const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname, '..')+'/';
let passed=0;
async function test(name,fn){await fn(); console.log('PASS '+name);passed++;}
function tile(id,{video=false,host='lh3.googleusercontent.com',suffix='w200-h200',noLabel=false}={}){
 const badge={textContent: video?'1:03':''};
 const image={style:{backgroundImage:`url("https://${host}/p/${id}=${suffix}")`}};
 return {style:{},getAttribute(key){return key==='aria-label'?(noLabel?'':video?'Video':`Photo ${id}`):'#';},querySelectorAll(sel){return sel==='div,span'?[badge]:[image];}};
}
function harness({pages=[[tile('one')]],delay=3,replace=false,limited=false,abortAt=0}={}){
 let current=0,ticks=0,stalls=0,top=0;
 const controller=new AbortController();
 const scroll={clientHeight:100,isConnected:true,get scrollTop(){return top},set scrollTop(v){top=Math.max(0,Math.min(v,this.scrollHeight-100));},get scrollHeight(){return (replace?1:current+1)*200;}};
 const parent={clientHeight:0,parentElement:scroll};
 for(const page of pages)for(const t of page)t.parentElement=parent;
 scroll.parentElement=null;
 const main={isConnected:true,textContent:limited?'You’re seeing a limited view of Google Maps.':'',contains(el){return el===parent||el===scroll;},querySelector(){return pages[current][0];},querySelectorAll(sel){if(sel==='button'||sel==='[role="tab"],button')return [];return replace?pages[current]:pages.slice(0,current+1).flat();}};
 scroll.parentElement=main;
 const document={querySelectorAll(){return [main];}};
 const ctx=vm.createContext({URL,DOMException,AbortController,document,getComputedStyle(){return {overflowY:'auto'};},MutationObserver:class {observe(){}disconnect(){}},setTimeout(fn){queueMicrotask(()=>{
   ticks++;
   if(scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight){stalls++;if(stalls>=delay&&current<pages.length-1){current++;stalls=0;if(replace)top=0;}}
   if(abortAt&&ticks===abortAt)controller.abort();
   fn();
 });return ticks;},clearTimeout(){}});
 vm.runInContext(readFileSync(root+'media-utils.js','utf8')+'\n'+readFileSync(root+'bulk.js','utf8')+';globalThis.bulk=GMapsBulk;',ctx);
 return {bulk:ctx.bulk,controller,main,scroll};
}
(async()=>{
 await test('Collect photo once across resize variants and CDN shards; skip videos',()=>{
   const h=harness({pages:[[tile('a'),tile('a',{host:'lh6.googleusercontent.com',suffix:'w600'}),tile('b',{video:true}),tile('c',{host:'lh3.googleusercontent.com.evil.test'})]]});
   const found=new Map(),skipped=new Set();h.bulk.collect(h.main,found,skipped,false);
   assert.equal(found.size,1);assert.equal(skipped.size,1);assert.equal([...found.values()][0].url,'https://lh3.googleusercontent.com/p/a=s0');
 });
 await test('Optional video uses video URL, not a JPEG thumbnail',()=>{
   const h=harness({pages:[[tile('clip',{video:true,noLabel:true})]]});const found=new Map();h.bulk.collect(h.main,found,new Set(),true);
   assert.equal([...found.values()][0].type,'video');assert.equal([...found.values()][0].url,'https://lh3.googleusercontent.com/p/clip=dv');
 });
 await test('Waits through delayed lazy pages, deduplicates repeats, restores scroll',async()=>{
   const h=harness({pages:[[tile('a')],[tile('a'),tile('b')],[tile('c',{video:true}),tile('d')]],delay:4});
   const counts=[];const r=await h.bulk.scan({signal:h.controller.signal,includeVideos:false,onProgress(n){counts.push(n);}});
   assert.equal(r.items.length,3);assert.equal(r.skipped,1);assert(counts.includes(1)&&counts.includes(3));assert.equal(h.scroll.scrollTop,0);
 });
 await test('Retains earlier media when gallery virtualizes and removes old tiles',async()=>{
   const h=harness({pages:[[tile('first')],[tile('second')],[tile('third')]],replace:true});
   const r=await h.bulk.scan({signal:h.controller.signal,includeVideos:false,onProgress(){}});assert.equal(r.items.length,3);
 });
 await test('Limited gallery is reported without claiming full coverage',async()=>{
   const h=harness({limited:true});const r=await h.bulk.scan({signal:h.controller.signal,includeVideos:false,onProgress(){}});assert.equal(r.limited,true);assert.match(r.reason,/limiting/);
 });
 await test('Selects All when gallery is filtered to a category',async()=>{
   const h=harness();let selected=false;const query=h.main.querySelectorAll.bind(h.main);
   h.main.querySelectorAll=sel=>sel==='[role="tab"],button'?[{getAttribute(key){return key==='aria-label'?'All':'false';},click(){selected=true;}}]:query(sel);
   await h.bulk.scan({signal:h.controller.signal,includeVideos:false,onProgress(){}});assert.equal(selected,true);
 });
 await test('Cancellation interrupts collection and restores scrolling',async()=>{
   const h=harness({abortAt:3});await assert.rejects(()=>h.bulk.scan({signal:h.controller.signal,includeVideos:false,onProgress(){}}),{name:'AbortError'});assert.equal(h.scroll.scrollTop,0);
 });
 await test('Closing/replacing gallery fails safely',async()=>{
   const h=harness();h.main.isConnected=false;await assert.rejects(()=>h.bulk.scan({signal:h.controller.signal,includeVideos:false,onProgress(){}}),/Gallery changed/);
 });
 let listener, options, error, item={id:7,byExtensionId:'mine',state:'complete'},cancelled;
 const chrome={runtime:{id:'mine',onMessage:{addListener(fn){listener=fn;}}},downloads:{download(o,cb){options=o;cb(7);},search(q,cb){chrome.runtime.lastError=error;cb(item?[item]:[]);delete chrome.runtime.lastError;},cancel(id,cb){cancelled=id;cb();}}};
 const ctx=vm.createContext({URL,chrome,importScripts(){},Date});vm.runInContext(readFileSync(root+'media-utils.js','utf8')+'\n'+readFileSync(root+'background.js','utf8'),ctx);
 const sender={id:'mine',url:'https://www.google.com/maps/place/test',tab:{url:'https://www.google.com/maps/place/test'}};
 function send(msg){let response;listener(msg,sender,r=>response=r);return response;}
 await test('Bulk filenames cannot escape destination and disable Save As per file',()=>{
   assert.equal(send({action:'download-hd',url:'https://lh3.googleusercontent.com/p/test=w200',bulk:true,folder:'../../evil\\folder',index:2}).success,true);
   assert.match(options.filename,/^gmaps-hd\/[a-zA-Z0-9_-]+\/00002\.jpg$/);assert.equal(options.saveAs,false);assert(!options.filename.includes('..'));
 });
 await test('Completion status and interruptions come from Chrome',()=>{
   assert.equal(send({action:'download-status',id:7}).state,'complete');item.state='interrupted';item.error='NETWORK_FAILED';assert.equal(send({action:'download-status',id:7}).error,'NETWORK_FAILED');
 });
 await test('Only this extension’s downloads can be inspected or cancelled',()=>{
   assert.equal(send({action:'cancel-download',id:7}).success,true);assert.equal(cancelled,7);cancelled=undefined;
   item.byExtensionId='another';assert.equal(send({action:'cancel-download',id:7}).success,false);assert.equal(cancelled,undefined);
   assert.equal(send({action:'download-status',id:-1}).success,false);
 });

 await test('Stopping during a download cancels it and prevents later queued files',async()=>{
   const elements=Object.fromEntries(['#gmaps-hd-bar-status','#gmaps-hd-bar-btn','#gmaps-hd-bulk-btn','#gmaps-hd-include-videos','#gmaps-hd-stop-btn'].map(id=>[id,{disabled:false,hidden:true,checked:false,textContent:'',title:''}]));
   const bar={querySelector(id){return elements[id];}};
   let activeDownloads=0, cancelledId;
   const ctx=vm.createContext({URL,DOMException,AbortController,Date,console,window:{location:{href:'https://example.com',pathname:'/maps/place/test/@0'},addEventListener(){}},document:{addEventListener(){},querySelectorAll(){return [];},querySelector(){return null;}},setInterval(){},setTimeout,clearTimeout,
     GMapsBulk:{scan:async()=>({items:[{type:'photo',url:'https://lh3.googleusercontent.com/p/one'},{type:'photo',url:'https://lh3.googleusercontent.com/p/two'}],skipped:0,reason:'No more photos loaded'}),sleep:async()=>{vm.runInContext('bulkJob.controller.abort()',ctx);throw new DOMException('Stopped','AbortError');}},
     chrome:{runtime:{sendMessage:async msg=>{if(msg.action==='cancel-download'){cancelledId=msg.id;return {success:true};}activeDownloads++;return {success:true,downloadId:88};}}}});
   vm.runInContext(readFileSync(root+'media-utils.js','utf8')+'\n'+readFileSync(root+'content.js','utf8'),ctx);
   ctx.testBar=bar;await vm.runInContext('downloadBar=testBar;handleBulkDownload()',ctx);
   assert.equal(activeDownloads,1);assert.equal(cancelledId,88);assert.equal(elements['#gmaps-hd-bulk-btn'].disabled,false);assert.equal(elements['#gmaps-hd-stop-btn'].hidden,true);assert.match(elements['#gmaps-hd-bar-status'].textContent,/Stopped/);
 });
 console.log(`${passed} bulk checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
