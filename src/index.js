const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type, Accept",
  "access-control-max-age": "86400"
};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=60"}})}
function decodeHtml(s=""){return s.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&#x27;/gi,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))}
function cleanText(s=""){return decodeHtml(s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim())}
function extractResults(html){
 const blocks=html.match(/<div class="MjjYud"[\s\S]*?(?=<div class="MjjYud"|$)/gi)||[],out=[];
 for(const block of blocks){
  const title=block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i),anchor=block.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<h3/i);
  if(!title||!anchor)continue;let target=decodeHtml(anchor[1]);
  if(target.startsWith("/url?")){try{target=new URL(target,"https://www.google.com").searchParams.get("q")||""}catch{}}
  if(!/^https?:\/\//i.test(target))continue;
  const snip=block.match(/<div class="(?:VwiC3b|yXK7lf|s3v9rd)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  let content=snip?cleanText(snip[1]):cleanText(block).replace(cleanText(title[1]),"").slice(0,420);
  out.push({title:cleanText(title[1]),url:target,content,engine:"Google"});
 }
 const seen=new Set();return out.filter(x=>x.title&&x.url&&!seen.has(x.url)&&seen.add(x.url)).slice(0,20)
}
async function googleSearch(query,language,page){
 const u=new URL("https://www.google.com/search");u.searchParams.set("q",query);u.searchParams.set("hl",language||"he");u.searchParams.set("gl","IL");u.searchParams.set("num","20");u.searchParams.set("start",String((page-1)*20));
 const r=await fetch(u.toString(),{headers:{"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml","accept-language":"he-IL,he;q=0.9,en;q=0.8"},redirect:"follow"});
 if(!r.ok)return {error:"Google החזיר HTTP "+r.status+". ייתכן שהבקשה הוגבלה זמנית.",results:[],status:502};
 const html=await r.text();if(/unusual traffic|sorry\/index|our systems have detected/i.test(html))return {error:"Google זיהה תעבורה חריגה וחסם זמנית את בקשת השרת. נסה שוב מאוחר יותר.",results:[],status:503};
 const results=extractResults(html);if(!results.length)return {error:"Google החזיר עמוד, אך מבנה התוצאות לא זוהה. ייתכן ש-Google שינה את העמוד או הציג בדיקת אבטחה.",results:[],status:502};
 return {results,status:200}
}

const healthSources = [
  ["Google","https://www.google.com/search?q=SearchX+test"],
  ["ויקיפדיה","https://he.wikipedia.org/w/api.php?action=query&list=search&srsearch=test&format=json"],
  ["Wikimedia Commons","https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=test&format=json"],
  ["GDELT חדשות","https://api.gdeltproject.org/api/v2/doc/doc?query=test&mode=ArtList&format=json&maxrecords=1"],
  ["Internet Archive","https://archive.org/advancedsearch.php?q=test&rows=1&output=json"],
  ["Open Library","https://openlibrary.org/search.json?q=test&limit=1"],
  ["Crossref","https://api.crossref.org/works?query=test&rows=1"],
  ["OpenAlex","https://api.openalex.org/works?search=test&per-page=1"],
  ["Stack Exchange","https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=test&site=stackoverflow&pagesize=1"],
  ["Openverse","https://api.openverse.org/v1/images/?q=test&page_size=1"],
  ["מתמחים טופ","https://mitmachim.top/"],
  ["פרוג","https://www.prog.co.il/"],
  ["Ynet","https://www.ynet.co.il/"],
  ["Walla","https://www.walla.co.il/"],
  ["Mako","https://www.mako.co.il/"],
  ["N12","https://www.n12.co.il/"],
  ["Globes","https://www.globes.co.il/"],
  ["Calcalist","https://www.calcalist.co.il/"],
  ["Geektime","https://www.geektime.co.il/"],
  ["כאן","https://www.kan.org.il/"]
];
async function checkSource(name,target){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000),started=Date.now();
 try{
  const response=await fetch(target,{method:"GET",headers:{"user-agent":"SearchX-source-check/1.0","accept":"application/json,text/html,*/*"},redirect:"follow",signal:controller.signal});
  try{await response.body?.cancel()}catch{}
  return {name,ok:response.status>=200&&response.status<400,status:response.status,ms:Date.now()-started};
 }catch(error){
  return {name,ok:false,status:0,ms:Date.now()-started,error:error?.name==="AbortError"?"timeout":(error?.message||"network error").slice(0,120)};
 }finally{clearTimeout(timer)}
}
async function checkAllSources(){
 const checks=await Promise.all(healthSources.map(([name,target])=>checkSource(name,target)));
 return {checkedAt:new Date().toISOString(),total:checks.length,ok:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length,checks};
}

export default {async fetch(request,env){
 const url=new URL(request.url);
 if(request.method==="OPTIONS"&&(url.pathname==="/api/search"||url.pathname==="/api/health"||(url.pathname==="/"&&(url.searchParams.has("q")||url.searchParams.has("health"))))return new Response(null,{status:204,headers:corsHeaders});
 if(url.pathname==="/api/health"||(url.pathname==="/"&&(url.searchParams.has("health")||(!url.searchParams.has("q")&&(request.headers.get("accept")||"").includes("application/json"))))){
  if(request.method!=="GET")return json({error:"Method not allowed"},405);
  const report=await checkAllSources();
  return json(report,200);
 }
 if(url.pathname==="/api/search"||(url.pathname==="/"&&url.searchParams.has("q"))){
  if(request.method!=="GET")return json({error:"Method not allowed",results:[]},405);
  const q=(url.searchParams.get("q")||"").trim();if(!q)return json({error:"יש להזין מילת חיפוש.",results:[]},400);
  if(q.length>300)return json({error:"השאילתה ארוכה מדי (מקסימום 300 תווים).",results:[]},400);
  const page=Math.min(10,Math.max(1,Number.parseInt(url.searchParams.get("pageno")||"1",10)||1));
  try{const x=await googleSearch(q,url.searchParams.get("language")||"he",page);return json({results:x.results,error:x.error||null,engine:"Google"},x.status)}
  catch(e){return json({error:"לא ניתן להתחבר כרגע ל-Google דרך השרת. "+(e?.message||""),results:[]},502)}
 }
 return env.ASSETS.fetch(request)
}};
