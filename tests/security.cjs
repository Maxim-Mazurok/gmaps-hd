const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '..') + '/';
let tests = 0;
function check(name, fn) { fn(); tests++; console.log('PASS ' + name); }
const ctx = vm.createContext({URL});
vm.runInContext(fs.readFileSync(root+'media-utils.js','utf8')+'; globalThis.media = GMapsMedia;',ctx);
const m=ctx.media;
check('Maps host and path validation',()=>{
 for(const u of ['https://www.google.com/maps','https://www.google.com.au/maps/place/test','https://maps.google.co.uk/maps/']) assert(m.isMaps(u));
 for(const u of ['https://google.com.evil.test/maps','https://evilgoogle.com/maps','https://www.google.com/mapsfake','http://www.google.com/maps','https://www.google.com/search']) assert(!m.isMaps(u));
});
check('Reject hostile CDN lookalikes, credentials, ports and schemes',()=>{
 for(const u of ['https://lh3.googleusercontent.com.evil.test/x','https://evil.test/lh3.googleusercontent.com/x','https://user@lh3.googleusercontent.com/x','https://lh3.googleusercontent.com:123/x','http://lh3.googleusercontent.com/x','data:text/html,test','file:///etc/passwd',null,{}]) assert(!m.isMedia(u));
});
check('Accept exact Google media hosts',()=>{
 for(const host of ['lh3.googleusercontent.com','lh6.googleusercontent.com','lh4.ggpht.com','geo0.ggpht.com','streetviewpixels-pa.googleapis.com']) assert(m.isMedia('https://'+host+'/image'));
});
check('Photo quality conversion is repeatable and preserves queries',()=>{
 const u='https://lh3.googleusercontent.com/p/test=w600-h400-k-no?foo=bar';
 assert.equal(m.withQuality(u,'s0'),'https://lh3.googleusercontent.com/p/test=s0?foo=bar');
 assert.equal(m.withQuality(m.withQuality(u,'s0'),'s0'),m.withQuality(u,'s0'));
});
check('Video quality replaces existing video suffix instead of duplicating',()=>{
 for(const suffix of ['w100-h200','dv','m37','s0']) assert.equal(m.withQuality('https://lh3.googleusercontent.com/p/test='+suffix,'m22'),'https://lh3.googleusercontent.com/p/test=m22');
});
check('Street View URL remains intact',()=>{
 const u='https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=test&w=800';
 assert.equal(m.withQuality(u,'s0'),u);
});
check('Invalid URL and quality fail closed',()=>{
 assert.throws(()=>m.withQuality('https://evil.test/image','s0'));
 assert.throws(()=>m.withQuality('https://lh3.googleusercontent.com/p/image','bad'));
});
check('Malformed percent encoding does not crash detection',()=>assert.equal(m.decode('https://www.google.com/maps/%ZZ'),'https://www.google.com/maps/%ZZ'));
let listener, calls=[], downloadError;
const chrome={runtime:{id:'test-id',onMessage:{addListener(fn){listener=fn;}}},downloads:{download(options,cb){calls.push(options);chrome.runtime.lastError=downloadError;cb(downloadError?undefined:42);delete chrome.runtime.lastError;}}};
const bg=vm.createContext({URL,chrome,importScripts(){},Date});
vm.runInContext(fs.readFileSync(root+'media-utils.js','utf8')+'\n'+fs.readFileSync(root+'background.js','utf8'),bg);
const sender={id:'test-id',tab:{id:1},url:'https://www.google.com.au/maps/place/test'};
function send(msg,s=sender){let result; const keep=listener(msg,s,r=>result=r); return {result,keep};}
check('Valid download waits for callback and returns download ID',()=>{
 const {result,keep}=send({action:'download-hd',url:'https://lh3.googleusercontent.com/p/test=w600'});
 assert.equal(keep,true); assert.equal(result.downloadId,42); assert.equal(calls.at(-1).url,'https://lh3.googleusercontent.com/p/test=s0');
});
check('Unauthorized senders and non-CDN URLs never reach downloads',()=>{
 const before=calls.length;
 for(const s of [{...sender,id:'other'},{...sender,tab:undefined},{...sender,url:'https://evil.test/maps'},{...sender,url:'https://google.com.evil.test/maps'}]) assert.equal(send({action:'download-hd',url:'https://lh3.googleusercontent.com/p/test'},s).result.success,false);
 assert.equal(send({action:'download-video',url:'https://evil.test/file.exe'}).result.success,false);
 assert.equal(calls.length,before);
});
check('Browser download errors propagate to the user',()=>{
 downloadError={message:'Network unavailable'};
 const {result}=send({action:'download-hd',url:'https://lh3.googleusercontent.com/p/test'});
 assert.equal(result.success,false);assert.equal(result.error,'Network unavailable');downloadError=undefined;
});
check('Malformed messages are ignored safely',()=>{assert.equal(send(null).result,undefined);assert.equal(send({action:'unknown'}).result,undefined);});
const window={location:{href:'https://example.com',hostname:'example.com',pathname:'/'},addEventListener(){}};
let images=[];
const document={body:{},documentElement:{},addEventListener(){},querySelector(){return null;},querySelectorAll(sel){return sel==='img'?images:[];}};
const page=vm.createContext({URL,window,document,chrome,innerHeight:800,innerWidth:1000,setInterval(){},setTimeout(){},getComputedStyle(){return {backgroundImage:'none'};},console});
vm.runInContext(fs.readFileSync(root+'media-utils.js','utf8')+'\n'+fs.readFileSync(root+'content.js','utf8'),page);
check('Malformed Maps page URL does not crash content code',()=>{
 window.location.href='https://www.google.com/maps/%ZZ';assert.equal(vm.runInContext('detectMediaType()',page),'image');
});
check('Largest media ignores offscreen images and hostile hosts',()=>{
 function image(src,w,h,top=0){return {src,getBoundingClientRect(){return {width:w,height:h,top,bottom:top+h,left:0,right:w};}};}
 images=[image('https://lh3.googleusercontent.com/p/hidden',900,700,-1000),image('https://evil.test/lh3.googleusercontent.com/x',900,700),image('https://lh3.googleusercontent.com/p/visible',400,400)];
 assert.equal(vm.runInContext('findLargestGoogleMedia()',page),'https://lh3.googleusercontent.com/p/visible');
});
check('Manifest exposes only downloads and HTTPS Maps pages',()=>{
 const manifest=JSON.parse(fs.readFileSync(root+'manifest.json'));
 assert.deepEqual(manifest.permissions,['downloads']);
 assert(manifest.content_scripts[0].matches.every(x=>x.startsWith('https://')&&x.endsWith('/maps*')&&!x.includes('<all_urls>')));
 for(const f of [...manifest.content_scripts[0].js,...manifest.content_scripts[0].css,manifest.background.service_worker,manifest.action.default_popup,...Object.values(manifest.icons)])assert(fs.existsSync(root+f));
});
console.log(`${tests} checks passed`);
