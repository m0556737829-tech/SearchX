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
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(request.method==="OPTIONS"&&url.pathname==="/api/search")return new Response(null,{status:204,headers:corsHeaders});
 if(url.pathname==="/api/search"){
  if(request.method!=="GET")return json({error:"Method not allowed",results:[]},405);
  const q=(url.searchParams.get("q")||"").trim();if(!q)return json({error:"יש להזין מילת חיפוש.",results:[]},400);
  if(q.length>300)return json({error:"השאילתה ארוכה מדי (מקסימום 300 תווים).",results:[]},400);
  const page=Math.min(10,Math.max(1,Number.parseInt(url.searchParams.get("pageno")||"1",10)||1));
  try{const x=await googleSearch(q,url.searchParams.get("language")||"he",page);return json({results:x.results,error:x.error||null,engine:"Google"},x.status)}
  catch(e){return json({error:"לא ניתן להתחבר כרגע ל-Google דרך השרת. "+(e?.message||""),results:[]},502)}
 }
 return env.ASSETS.fetch(request)
}};
