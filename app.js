/* Jarvis HUD wall screen. Plain ES5 for the old Vizio WebKit browser. */
(function(){
'use strict';
var A='#5CE1E6',W='#E8EEF0',D='#9AA7AB',BG='#050607',HL='#2A3236',BARC='#4A5A5E';
var RAMP=['#14191B','#1F4446','#3A7C80',A];
var NAMES=['OVERVIEW','SCHEDULE','HABITS','WORKOUT','FINANCES'];
var DAYS=['SUN','MON','TUE','WED','THU','FRI','SAT'];
var ROTATE_MS=20000, IDLE_MS=60000;

var stage=document.getElementById('stage'), track=document.getElementById('track');
var DATA=null, EVENTS=[], WX=null, WXFAIL=false;
var cur=0, secIdx=[0,0,0,0,0], paused=false, nightOn=false;
var lastInput=-1e9, lastSwitch=new Date().getTime();
var Q=parseQuery(), noMotion=Q.motion==='0';
var POLL_MS=Math.max(2,+(Q.poll||30))*1000, LOADED=new Date().getTime(), lastSync=null, syncFail=false, RAWD='', RAWE='';
function priv(){return !!(DATA&&DATA['public']);}
var raf=window.requestAnimationFrame||window.webkitRequestAnimationFrame||function(fn){return window.setTimeout(fn,16);};

/* ---------- small utils ---------- */
function parseQuery(){var o={},s=window.location.search.replace(/^\?/,'').split('&'),i,p;
  for(i=0;i<s.length;i++){if(!s[i])continue;p=s[i].split('=');o[decodeURIComponent(p[0])]=decodeURIComponent(p[1]||'');}return o;}
function pad(n){return (n<10?'0':'')+n;}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function money(v){if(v==null||isNaN(v))return null;var n=Math.round(Math.abs(v)),s=String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');return (v<0?'-$':'$')+s;}
function moneyOr(v){if(priv())return '<span class="warn">PRIVATE</span>';var m=money(v);return m==null?'<span class="warn">EDIT ME</span>':m;}
function hasClass(el,c){return (' '+el.className+' ').indexOf(' '+c+' ')>=0;}
function addClass(el,c){if(!hasClass(el,c)){el.className+=' '+c;}}
function rmClass(el,c){el.className=(' '+el.className+' ').replace(' '+c+' ',' ').replace(/^\s+|\s+$/g,'');}
function setT(el,t){el.style.webkitTransform=t;el.style.transform=t;}
function clean(t){return String(t||'').replace(/\u2014|\u2013/g,'-').toLowerCase();}
function cut(t,n){return t.length>n?t.substr(0,n-1)+'.':t;}

/* clock with optional ?now=2026-11-03T07:10 override for testing */
var nowBase=null,nowStart=new Date().getTime();
if(Q.now){var m=Q.now.match(/(\d+)-(\d+)-(\d+)T(\d+):(\d+)(?::(\d+))?/);if(m){nowBase=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)).getTime();}}
function now(){return nowBase?new Date(nowBase+(new Date().getTime()-nowStart)):new Date();}
function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function hm(d){return pad(d.getHours())+':'+pad(d.getMinutes());}

/* fresh start: day counter from DATA.fresh_start.date (no sample history) */
function startDate(){var f=(DATA&&DATA.fresh_start&&DATA.fresh_start.date)||(DATA&&DATA.streak&&DATA.streak.start_date)||'2026-11-04',m=String(f).match(/(\d+)-(\d+)-(\d+)/);return m?new Date(+m[1],+m[2]-1,+m[3]):now();}
function dayN(){var n=now(),t=new Date(n.getFullYear(),n.getMonth(),n.getDate());return Math.max(1,Math.round((t.getTime()-startDate().getTime())/864e5)+1);}
function dayTag(){var len=(DATA&&DATA.fresh_start&&DATA.fresh_start.days)||30;return 'DAY '+dayN()+' OF '+len;}
function startTag(){var d=startDate();return pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function empty(x,y,w,h,title,msg){return frame(x,y,w,h,title)+ab('so d',x,y+Math.round(h/2)-70,w,'font-size:72px;text-align:center',dayTag())+ab('lab',x,y+Math.round(h/2)+30,w,'text-align:center',msg||'HISTORY STARTS '+startTag()+'. LOG DAILY AND THIS FILLS IN.');}

/* ---------- XHR ---------- */
function getJSON(url,ok,fail,nocache){var x=new XMLHttpRequest();
  try{x.open('GET',url,true);if(nocache){x.setRequestHeader('Cache-Control','no-cache');x.setRequestHeader('Pragma','no-cache');}}catch(e){if(fail)fail();return;}
  x.onreadystatechange=function(){if(x.readyState!==4)return;
    if((x.status===200||x.status===0)&&x.responseText){var j=null;try{j=JSON.parse(x.responseText);}catch(e){}
      if(j){ok(j,x.responseText);return;}}
    if(fail)fail();};
  x.send(null);}

/* ---------- HTML builders (absolute pixel, stage coordinates) ---------- */
function ab(cls,x,y,w,extra,html){return '<div class="a '+cls+'" style="left:'+x+'px;top:'+y+'px;'+(w?'width:'+w+'px;':'')+(extra||'')+'">'+html+'</div>';}
function frame(x,y,w,h,title,col){col=col||D;var k=28,s='<div class="fr" style="left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h+'px">',c=[[0,0,'left','top'],[w-k,0,'right','top'],[0,h-k,'left','bottom'],[w-k,h-k,'right','bottom']],i;
  for(i=0;i<4;i++){s+='<div class="cn" style="left:'+c[i][0]+'px;top:'+c[i][1]+'px;border-'+c[i][2]+':2px solid '+col+';border-'+c[i][3]+':2px solid '+col+'"></div>';}
  if(title){s+='<div class="ft lab">'+title+'</div>';}
  return s+'</div>';}
function hbar(x,y,w,h,pct,col){pct=Math.max(0,Math.min(100,pct||0));
  return '<div class="track" style="left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h+'px"><div class="fill" style="width:'+pct+'%;background:'+(col||A)+'"></div></div>';}
function cu(v,pre,cls,extra){return '<span class="cu '+(cls||'')+'" data-v="'+v+'" data-p="'+(pre||'')+'"'+(extra||'')+'>'+(pre||'')+String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'</span>';}
/* HTML div bar chart */
function bars(x,y,w,h,vals,labels,hi,tops,bw){var n=vals.length,mx=1,i,s='',st=w/n,ch=h-96;
  for(i=0;i<n;i++){if(vals[i]>mx)mx=vals[i];}
  for(i=0;i<n;i++){var bh=Math.round(ch*vals[i]/mx),bx=Math.round(x+i*st+st*(1-bw)/2),by=y+46+ch-bh,on=(i===hi);
    s+='<div class="bar" style="left:'+bx+'px;top:'+by+'px;width:'+Math.round(st*bw)+'px;height:'+Math.max(bh,2)+'px;background:'+(on?A:BARC)+'"></div>';
    s+=ab('lab',Math.round(x+i*st),by-46,Math.round(st),'text-align:center;'+(on?'color:'+A:''),tops?tops[i]:vals[i]);
    s+=ab('lab',Math.round(x+i*st),y+h-40,Math.round(st),'text-align:center;',labels[i]);}
  return s;}
function T(x,y,t,c,anc){return '<text x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" font-size="32" fill="'+(c||D)+'" text-anchor="'+(anc||'start')+'" font-family="JB, monospace">'+t+'</text>';}
/* static SVG lines + mask reveal */
function lines(x,y,w,h,series,labels,lo,hi,right,grid,delayIdx){var n=labels.length,top=30,bot=50,s='',i,j;
  function X(i){return 10+i*(w-right-20)/(n-1);} function Y(v){return top+(h-top-bot)*(1-(v-lo)/(hi-lo));}
  for(i=0;i<(grid||[]).length;i++){s+='<line x1="0" x2="'+(w-right)+'" y1="'+Y(grid[i])+'" y2="'+Y(grid[i])+'" stroke="'+HL+'" stroke-width="1" stroke-dasharray="4 8"/>'+T(14,Y(grid[i])-10,String(grid[i]));}
  for(j=0;j<series.length;j++){var sr=series[j],pts=[],lp=null;
    for(i=0;i<sr.v.length;i++){if(sr.v[i]!=null){lp=[X(i),Y(sr.v[i])];pts.push(lp[0].toFixed(1)+','+lp[1].toFixed(1));}}
    s+='<polyline fill="none" stroke="'+sr.c+'" stroke-width="'+sr.sw+'" points="'+pts.join(' ')+'"/>';
    if(lp){s+='<circle cx="'+lp[0].toFixed(1)+'" cy="'+lp[1].toFixed(1)+'" r="7" fill="'+sr.c+'"/>'+T(lp[0]+18,lp[1]+11,sr.n,sr.c===A?A:W);}}
  s+=T(10,h-8,labels[0])+T(X(n-1),h-8,labels[n-1],D,'end');
  return '<div class="chart" style="left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h+'px"><svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">'+s+'</svg><div class="mask"></div></div>';}

/* ---------- derived data ---------- */
function checklistMap(){var o={},c=DATA.checklist||[],i;for(i=0;i<c.length;i++){o[c[i].key]=c[i];}return o;}
function goal(label){var g=(DATA.money&&DATA.money.goals)||[],i;for(i=0;i<g.length;i++){if(g[i].label===label)return g[i];}return null;}
function balance(label){var g=(DATA.money&&DATA.money.balances)||[],i;for(i=0;i<g.length;i++){if(g[i].label===label)return g[i].value;}return null;}
function scheduleFor(d){var day=ymd(d),out=[],i,e;
  for(i=0;i<EVENTS.length;i++){e=EVENTS[i];if(!e.allDay&&String(e.start).substr(0,10)===day){out.push({s:String(e.start).substr(11,5),e:String(e.end||'').substr(11,5),t:clean(e.title)});}}
  if(!out.length){var ds=DATA.defaultSchedule||[];for(i=0;i<ds.length;i++){if((ds[i].days||[]).join(',').indexOf(String(d.getDay()))>=0){out.push({s:ds[i].start,e:ds[i].end,t:clean(ds[i].title)});}}}
  out.sort(function(a,b){return a.s<b.s?-1:1;});return out;}
function withStatus(items){var t=hm(now()),i;for(i=0;i<items.length;i++){var it=items[i];it.st=(it.e&&it.e<=t)?'done':((it.s<=t&&(!it.e||t<it.e))?'now':'');}return items;}
function wxText(short){if(!WX)return WXFAIL?'WX OFFLINE':'WX ...';
  var c=WX.code,n='CLEAR';if(c===1)n='MOSTLY CLEAR';else if(c===2)n='PARTLY CLOUDY';else if(c===3)n='OVERCAST';else if(c===45||c===48)n='FOG';else if(c>=51&&c<=57)n='DRIZZLE';else if(c>=61&&c<=67)n='RAIN';else if(c>=71&&c<=77)n='SNOW';else if(c>=80&&c<=82)n='SHOWERS';else if(c>=85&&c<=86)n='SNOW SHOWERS';else if(c>=95)n='STORM';
  return Math.round(WX.t)+'&deg;F '+n+(short?'':', HI '+Math.round(WX.hi)+'&deg;');}
var HAB=null; /* 30-day grid: no stored history yet, only today's column is real */
function habits(){if(HAB)return HAB;var keys=[['gym','gym'],['anki','anki'],['study','study'],['sales','sales'],['phone','phone-free']],cm=checklistMap(),out=[],i,d;
  for(i=0;i<keys.length;i++){var v=[];for(d=0;d<29;d++){v.push(0);}
    v.push(cm[keys[i][0]]&&cm[keys[i][0]].done?3:0);out.push({k:keys[i][0],n:keys[i][1],v:v});}
  HAB=out;return out;}
function runOf(v){var c=0,i;for(i=v.length-1;i>=0;i--){if(v[i])c++;else if(i===v.length-1)continue;else break;}return c;}
function stats(v){var days=0,best=0,run=0,gap=0,g=0,i;for(i=0;i<v.length;i++){if(v[i]){days++;run++;g=0;if(run>best)best=run;}else{run=0;g++;if(g>gap)gap=g;}}return {days:days,best:best,gap:gap};}

/* ---------- chrome ---------- */
function dots(c,x,y){var s='',i;for(i=0;i<5;i++){s+='<div class="a" style="left:'+(x+i*64)+'px;top:'+(y+10)+'px;width:'+(i===c?40:14)+'px;height:14px;background:'+(i===c?A:HL)+'"></div>';}return s;}
function syncText(){var u=(DATA&&(DATA.data_updated||DATA.updatedFromExcel))||'',m=String(u).match(/T(\d\d):(\d\d)/),s=m?'UPDATED '+m[1]+':'+m[2]:'';
  if(syncFail&&lastSync)s+=(s?' &middot; ':'')+'LAST SYNC '+hm(lastSync);return s;}
function chrome(i){return ab('lab',64,48,0,'','JARVIS :: SYS.'+NAMES[i]+(priv()||Q.beta==='1'?' <span class="beta">BETA</span>':'')+' &nbsp;<span class="sync">'+syncText()+'</span>')+
  ab('lab r',1000,48,856,'','<span class="live"></span><span class="hdr">'+wxText(true)+' / AMES &middot; '+hm(now())+'</span>')+
  ab('lab',64,1000,0,'',dayTag()+' &middot; FRESH START '+startTag())+dots(i,810,1004)+
  ab('lab r',1356,1000,500,'','0'+(i+1)+' / 05 &nbsp; <span class="pg c">&#9660; 1/2</span>');}

/* ---------- slides ---------- */
function sOverview(){var n=now(),items=withStatus(scheduleFor(n)),cm=checklistMap(),st=DATA.streak||{},cl=DATA.checklist||[],ef=goal('Emergency fund'),i,a='',b='';
  a+=frame(64,110,960,390,'TIME')+ab('so clk',110,150,0,'font-size:230px;letter-spacing:-4px',hm(n))+ab('lab dateln',120,410,0,'',DAYS[n.getDay()]+' '+ymd(n)+' &middot; '+wxText(false));
  /* next up: last done, now, next ones */
  var k=0,start=0,lines_=[];for(i=0;i<items.length;i++){if(items[i].st==='done')start=i;}
  for(i=start;i<items.length&&lines_.length<4;i++){var it=items[i],c=it.st==='done'?'d':(it.st==='now'?'c':'');
    lines_.push('<span class="'+c+'">'+(it.st==='now'?'&gt; ':'')+it.s+' &nbsp;'+esc(cut(it.t,24))+(it.st==='done'?' &nbsp;[done]':'')+(it.st==='now'?' &nbsp;now':'')+'</span>');}
  if(!lines_.length){var tm=scheduleFor(new Date(n.getTime()+864e5));lines_.push('<span class="d">done for today. tomorrow:</span>');for(i=0;i<tm.length&&i<3;i++)lines_.push(tm[i].s+' &nbsp;'+esc(cut(tm[i].t,26)));}
  a+=frame(64,540,960,420,'NEXT UP')+ab('t',110,600,880,'line-height:76px;overflow:hidden',lines_.join('<br>'));
  var done=0,cs='';for(i=0;i<cl.length;i++){if(cl[i].done)done++;cs+=(cl[i].done?'<span class="c">[x]</span> ':'[ ] ')+esc(clean(cl[i].text))+'<br>';}
  a+=frame(1064,110,792,850,'STATUS')+ab('lab',1120,150,0,'','STREAK')+
    ab('so c',1116,190,0,'font-size:170px',cu(st.streak_current||0)+'<span class="d" style="font-size:44px"> d &nbsp;best '+(st.streak_longest||0)+'</span>')+
    ab('lab',1120,410,0,'','CHECKLIST '+done+'/'+cl.length)+ab('t',1120,456,0,'line-height:60px',cs);
  if(ef&&priv()){a+=ab('lab',1120,790,0,'','E.FUND <span class="warn">PRIVATE</span>');}
  else if(ef){var pc=Math.round(100*ef.current/ef.target);a+=ab('lab',1120,790,0,'','E.FUND '+money(ef.current)+' / '+money(ef.target)+' &middot; '+pc+'%')+hbar(1120,838,680,20,pc);}
  a+=ab('lab',1120,884,700,'overflow:hidden','COURSES '+(st.courses_done||0)+'/'+(st.courses_total||0)+' &middot; PTS TODAY '+((DATA.points||{}).today||0)+'/'+((DATA.points||{}).dailyTarget||10));
  /* section 2 */
  var co=DATA.courses||[];b+=frame(64,110,1100,520,'COURSES / CERTS');
  for(i=0;i<co.length&&i<4;i++){var y=160+i*110,pct=co[i].done?100:0;
    b+=ab('t',110,y,740,'overflow:hidden',esc(cut(co[i].name,30)))+ab('lab r',870,y+6,250,'',(co[i].done?co[i].hours:0)+' / '+co[i].hours+' h &middot; '+esc(String(co[i].targetMonth||'').substr(0,3).toUpperCase()));
    b+=hbar(110,y+64,1010,6,pct,i===0?A:D);}
  var mo=DATA.money||{};
  b+=frame(1204,110,652,520,'TIPS / THIS WEEK')+ab('so',1250,170,560,'font-size:150px',mo.tips_week==null||priv()?'<span style="font-size:90px" class="warn">'+(priv()?'PRIVATE':'EDIT ME')+'</span>':cu(mo.tips_week,'$'))+
    ab('lab',1254,340,0,'line-height:50px','SHIFT INCOME WK '+moneyOr(mo.shift_income_week)+'<br>SPENT TODAY '+moneyOr(mo.spending_today)+'<br>WEEKLY INCOME EST. '+moneyOr(balance('Weekly income est.')))+
    ab('lab',1254,520,0,'','POINTS WEEK <span class="c">'+((DATA.points||{}).week||0)+'/'+((DATA.points||{}).weeklyTarget||60)+'</span>');
  var qs=DATA.quotes||['Never miss twice.'],q=qs[(n.getDate()+n.getMonth())%qs.length],pr=(DATA.today||{}).priority||'';
  b+=frame(64,670,1792,290,'MANTRA')+ab('so',110,740,1720,'font-size:96px;white-space:nowrap;overflow:hidden',esc(q))+ab('lab',114,870,1720,'overflow:hidden','PRIORITY: '+(/EDIT ME/.test(pr)||!pr?'<span class="warn">EDIT ME</span>':esc(pr.toUpperCase())));
  return [a,b];}

function timeline(items,y0,rowh,x0){var s='<div class="a" style="left:'+x0+'px;top:'+y0+'px;width:2px;height:'+(rowh*items.length)+'px;background:'+HL+'"></div>',i;
  for(i=0;i<items.length;i++){var it=items[i],y=y0+i*rowh,col=it.st==='done'?D:(it.st==='now'?A:W);
    s+=ab('t r',80,y,240,'color:'+col,it.s);
    s+='<div class="a" style="left:'+(x0-6)+'px;top:'+(y+20)+'px;width:14px;height:14px;'+(it.st?'background:'+col:'background:'+BG+';border:2px solid '+D)+'"></div>';
    s+=ab('t',x0+50,y,700,'overflow:hidden;color:'+col,esc(cut(it.t,27)));
    s+=ab('lab',x0+760,y+6,500,'',(it.e?it.s+'-'+it.e:'')+(it.st==='done'?' &middot; DONE':'')+(it.st==='now'?' &middot; NOW':''));}
  return s;}
function sSchedule(){var n=now(),items=withStatus(scheduleFor(n)),tm=scheduleFor(new Date(n.getTime()+864e5)),a='',b='',i;
  var first=items.slice(0,7);
  a+=frame(64,110,1792,850,'TODAY / '+DAYS[n.getDay()]+' '+ymd(n))+timeline(first,170,108,360);
  var t=hm(n),ni=-1;for(i=0;i<first.length;i++){if(first[i].st!=='done'){ni=i;break;}}
  if(ni<0&&first.length&&items.length<=7)ni=first.length;
  if(ni>=0){var ly=170+ni*108-8;a+='<div class="a" style="left:330px;top:'+ly+'px;width:1480px;height:2px;background:'+A+'"></div>'+ab('lab c',1500,ly-44,310,'text-align:right',t+' NOW');}
  var rest=items.slice(6);
  b+=frame(64,110,1792,500,'LATER TODAY')+(rest.length?timeline(rest.slice(0,5),160,92,360):ab('t d',110,170,0,'','nothing else today'));
  var tl=[];for(i=0;i<tm.length&&i<3;i++){tl.push(tm[i].s+' &nbsp;'+esc(cut(tm[i].t,40)));}
  var tn=new Date(n.getTime()+864e5);
  b+=frame(64,650,1792,310,'TOMORROW / '+DAYS[tn.getDay()]+' '+pad(tn.getMonth()+1)+'-'+pad(tn.getDate()))+ab('t',110,700,1180,'line-height:66px;overflow:hidden',tl.join('<br>')||'no events')+
    ab('lab r',1300,700,510,'line-height:50px','EVENTS TOMORROW '+tm.length+'<br>FIRST '+(tm[0]?tm[0].s:'--')+'<br>'+(tm.length>3?'+'+(tm.length-3)+' MORE':''));
  return [a,b];}

function sHabits(){var h=habits(),n=now(),a='',b='',i,d,cw=36,gp=6,gx=420;
  var from=new Date(n.getTime()-29*864e5),mn=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  a+=frame(64,110,1792,850,'CONSISTENCY / LAST 30 DAYS / '+dayTag());
  for(i=0;i<h.length;i++){a+=ab('t'+(h[i].k==='anki'?' c':''),110,200+i*130,0,'',h[i].n);}
  for(d=0;d<30;d++){var col='';for(i=0;i<h.length;i++){col+='<div class="a" style="left:0;top:'+(i*130)+'px;width:'+cw+'px;height:72px;background:'+RAMP[h[i].v[d]]+'"></div>';}
    a+='<div class="hcol" style="left:'+(gx+d*(cw+gp))+'px;top:190px">'+col+'</div>';}
  for(i=0;i<h.length;i++){a+=ab('so r'+(h[i].k==='anki'?' c':''),1690,196+i*130,140,'font-size:56px',runOf(h[i].v));}
  a+=ab('lab',gx,850,0,'',mn[from.getMonth()]+' '+pad(from.getDate()))+ab('lab',gx+30*(cw+gp)-300-gp,850,300,'text-align:right','TODAY')+ab('lab r',1500,160,330,'','RUN');
  a+=ab('lab',110,900,0,'','<span style="color:#3A7C80">&#9632;</span> partial &nbsp;<span class="c">&#9632;</span> full &middot; MAIN STREAK = ANKI (NEVER MISS TWICE)');
  b+=frame(64,110,1792,560,'PER HABIT / 30 DAYS / '+dayTag());
  b+=ab('lab',110,160,0,'','HABIT')+ab('lab r',640,160,220,'','DAYS')+ab('lab r',880,160,260,'','BEST RUN')+ab('lab r',1160,160,300,'','LONGEST GAP')+ab('lab r',1480,160,330,'','RATE');
  var tot=0;for(i=0;i<h.length;i++){var s=stats(h[i].v),y=220+i*84,c=h[i].k==='anki'?' c':'';tot+=s.days;
    b+=ab('t'+c,110,y,0,'',h[i].n)+ab('t r',640,y,220,'',s.days+'/'+Math.min(30,dayN()))+ab('t r',880,y,260,'',s.best+' d')+ab('t r',1160,y,300,'',s.gap+' d')+ab('t r',1480,y,330,'',Math.round(100*s.days/Math.min(30,dayN()))+'%');}
  var st=DATA.streak||{},pt=DATA.points||{};
  b+=frame(64,710,1792,250,'THIS MONTH / LIVE')+ab('so',110,770,0,'font-size:96px',cu(pt.month||0)+'<span class="lab"> / '+(pt.monthlyTarget||240)+' pts</span>')+
    ab('so',760,770,0,'font-size:96px',cu(st.hours_week||0)+'<span class="lab"> study h wk</span>')+ab('so c',1380,770,0,'font-size:96px',cu(st.streak_current||0)+'<span class="lab"> d streak</span>');
  return [a,b];}

function sWorkout(){var w=DATA.workout||{},n=now(),a='',b='',i,d;
  a+=frame(64,110,680,850,'GYM STREAK')+ab('so c',110,150,0,'font-size:260px',cu(w.gymStreak||0))+
    ab('lab',120,440,0,'line-height:46px','GYM STREAK (DAYS)<br>THIS WEEK '+(w.sessionsWeek||0)+'/'+(w.targetWeek||4)+'<br>'+esc(String(w.time||'').toUpperCase()));
  var p=(w.plan||{})[String(n.getDay())],tl='';
  if(p){var ex=(p.exercises||[]).slice(0,2).join(', ');tl='gym.'+esc(clean(p.name))+(w.doneToday?' <span class="c">done</span>':' <span class="d">todo</span>')+'<br><span class="d">'+(/EDIT ME/.test(ex)?'<span class="warn">EDIT ME</span>':esc(cut(ex,22)))+'</span><br><span class="d">'+esc(cut(w.notes?'note: '+w.notes:'no note yet',24))+'</span>';}
  else{tl='<span class="d">rest day</span><br><span class="d">'+esc(cut(w.notes?'note: '+w.notes:'',24))+'</span>';}
  a+=ab('lab',120,650,0,'','TODAY'+(w.placeholder?' &middot; PLACEHOLDER PLAN':''))+ab('t',120,700,600,'line-height:58px;overflow:hidden',tl);
  var heat=[],wi,lifted=0;for(wi=0;wi<12;wi++){var col=[];for(d=0;d<7;d++){col.push(wi===11&&d===(n.getDay()+6)%7&&w.doneToday?3:0);if(col[d])lifted++;}heat.push(col);}
  var hs='';for(wi=0;wi<12;wi++){var c='';for(d=0;d<7;d++){c+='<div class="a" style="left:0;top:'+(d*64)+'px;width:52px;height:52px;background:'+RAMP[heat[wi][d]]+'"></div>';}hs+='<div class="hcol" style="left:'+(910+wi*64)+'px;top:160px">'+c+'</div>';}
  var dl='MTWTFSS';for(d=0;d<7;d++){hs+=ab('lab',800,160+d*64+6,0,'',dl.charAt(d));}
  a+=frame(760,110,1096,560,'LIFT CONSISTENCY / 12 WK / '+dayTag())+hs+ab('lab',800,610,0,'','LIFTED '+lifted+'/84 DAYS &middot; <span class="c">&#9632;</span> HEAVY <span style="color:#3A7C80">&#9632;</span> LIGHT');
  a+=frame(760,710,1096,250,'SESSIONS / WK &middot; TARGET '+(w.targetWeek||4))+ab('so c',800,770,0,'font-size:110px',(w.sessionsWeek||0)+'<span class="lab"> / '+(w.targetWeek||4)+' THIS WEEK</span>');
  b+=empty(64,110,1792,520,'PR TREND / LB','NO LIFTS LOGGED YET. PRS SHOW UP HERE ONCE YOU LOG THEM.');
  b+=frame(64,670,1792,290,'RECENT SESSIONS');
  var ses=[[DAYS[n.getDay()]+' '+pad(n.getMonth()+1)+'-'+pad(n.getDate()),p?clean(p.name):'rest',w.notes?esc(cut(w.notes,48)):(w.doneToday?'done, no note':'not logged yet'),w.doneToday?'DONE':'TODO'],['','','<span class="d">older sessions show here after you log them</span>',''],['','','','']];
  for(i=0;i<3;i++){var y=710+i*74;b+=ab('t '+(i===0?'c':'d'),110,y,0,'',ses[i][0])+ab('t',440,y,0,'',ses[i][1])+ab('lab',640,y+6,840,'overflow:hidden',ses[i][2])+ab('t c r',1500,y,310,'',ses[i][3]);}
  return [a,b];}

function sFinances(){if(priv()){return [frame(64,110,1792,850,'FINANCES / PUBLIC BETA')+ab('so c',110,300,1700,'font-size:180px;text-align:center','PRIVATE')+ab('lab',110,560,1700,'text-align:center','MONEY IS HIDDEN ON THE PUBLIC BETA. FULL VIEW: sh serve.sh ON THE MAC'),frame(64,110,1792,850,'BALANCES / PUBLIC BETA')+ab('so c',110,300,1700,'font-size:180px;text-align:center','PRIVATE')];}
  var mo=DATA.money||{},ef=goal('Emergency fund'),debt=goal('Debt still to pay'),a='',b='',i;
  var cur_=ef?ef.current:0,floor=ef?ef.target:1000,stretch=2500,asof=mo.asOf||'';
  var stale=mo.stale?'<span class="warn">STALE: AS OF '+esc(asof.substr(5,2)+'/'+asof.substr(8,2))+'</span>':'AS OF '+esc(asof);
  a+=frame(64,110,1792,400,'EMERGENCY FUND / LIVE')+ab('so c',110,160,0,'font-size:180px',cu(cur_,'$'))+
    ab('lab',860,180,0,'line-height:48px','FLOOR '+money(floor)+' &middot; '+(cur_>=floor?'MET':money(floor-cur_)+' TO GO')+'<br>STRETCH '+money(stretch)+' &middot; '+Math.round(100*cur_/stretch)+'%<br>'+stale);
  var bx=110,bw=1700,fx=bx+Math.round(bw*floor/stretch);
  a+='<div class="a" style="left:'+bx+'px;top:400px;width:'+bw+'px;height:24px;border:1px solid '+HL+'"></div>'+hbar(bx+1,401,bw-2,22,100*cur_/stretch).replace('background:'+HL,'background:transparent');
  a+='<div class="a" style="left:'+fx+'px;top:388px;width:2px;height:48px;background:'+W+'"></div>'+ab('lab',fx-110,444,0,'',money(floor)+' FLOOR')+ab('lab r',1500,444,310,'',money(stretch))+ab('lab',110,444,0,'','$0');
  a+=empty(64,550,1792,410,'WEEKLY INCOME VS SPEND','NO WEEKS LOGGED YET. STARTED FRESH '+startTag()+'.');
  a+=ab('lab r',860,560,950,'background:'+BG,'THIS WK: TIPS '+moneyOr(mo.tips_week)+' &middot; SPENT TODAY '+moneyOr(mo.spending_today));
  b+=empty(64,110,1792,430,'TIPS PER SHIFT','NO SHIFTS LOGGED YET. TIPS THIS WEEK '+moneyOr(mo.tips_week)+'.');
  var tot=balance('Total');if(tot==null){tot=(balance('Checking')||0)+(balance('Cash')||0)+cur_;}
  b+=frame(64,580,1792,380,'MONEY / FRESH START '+startTag())+ab('so c',110,640,0,'font-size:150px',cu(tot,'$'))+ab('lab',114,820,0,'','TOTAL &middot; E.FUND + CHECKING + CASH');
  b+=ab('lab',1060,630,760,'line-height:56px','E.FUND '+moneyOr(cur_)+'<br>CHECKING '+moneyOr(balance('Checking'))+'<br>CASH '+moneyOr(balance('Cash'))+'<br>'+(debt&&debt.current!=null?'DEBT <span class="w">'+money(debt.current)+'</span>':'<span class="d">DEBT (OPTIONAL): NOT TRACKED</span>')+'<br>'+(mo.stale?'<span class="warn">LEDGER '+esc(asof)+'</span>':'<span class="d">AS OF '+esc(asof)+'</span>'));
  return [a,b];}

/* ---------- render ---------- */
var BUILD=[sOverview,sSchedule,sHabits,sWorkout,sFinances], LAST=[];
/* in-place refresh: only replace sections whose HTML changed; the visible one keeps its slide and scroll, skips entry animations and counts changed numbers from old to new */
function cuVals(root){var o=[],c=root.getElementsByTagName('span'),k;for(k=0;k<c.length;k++){if(hasClass(c[k],'cu'))o.push(+c[k].getAttribute('data-v'));}return o;}
function refresh(){if(!DATA||!document.getElementById('sc0_0'))return;var i,s,secs,el,changed=0;
  for(i=0;i<5;i++){secs=BUILD[i]();if(!LAST[i])LAST[i]=[document.getElementById('sc'+i+'_0').innerHTML,document.getElementById('sc'+i+'_1').innerHTML];
    for(s=0;s<2;s++){if(LAST[i][s]===secs[s])continue;el=document.getElementById('sc'+i+'_'+s);LAST[i][s]=secs[s];changed++;
      var vis=(i===cur&&s===secIdx[cur]),old=vis?cuVals(el):null;
      if(vis){addClass(el,'settled');}
      el.innerHTML=secs[s];
      if(vis){var c=el.getElementsByTagName('span'),k,n=0;for(k=0;k<c.length;k++){if(hasClass(c[k],'cu')){var to=+c[k].getAttribute('data-v');if(old[n]!=null&&old[n]!==to)countUp(c[k],old[n]);n++;}}}}}
  var sp=stage.getElementsByTagName('span');for(i=0;i<sp.length;i++){if(hasClass(sp[i],'sync'))sp[i].innerHTML=syncText();}
  return changed;}
function render(){var h='',i,secs;LAST=[];
  for(i=0;i<5;i++){secs=BUILD[i]();LAST.push(secs);
    h+='<div class="slide" id="sl'+i+'" style="left:'+(i*1920)+'px">'+chrome(i)+'<div class="clip"><div class="sections" id="ss'+i+'"><div class="sec" id="sc'+i+'_0" style="top:0">'+secs[0]+'</div><div class="sec" id="sc'+i+'_1" style="top:1080px">'+secs[1]+'</div></div></div></div>';}
  track.innerHTML=h;
  for(i=0;i<5;i++){applySection(i,false);}
  goSlide(cur,false);}
function pagers(i){var p=document.getElementById('sl'+i).getElementsByTagName('span'),k;
  for(k=0;k<p.length;k++){if(hasClass(p[k],'pg')){p[k].innerHTML=secIdx[i]?'&#9650; 2/2':'&#9660; 1/2';p[k].className=secIdx[i]?'pg':'pg c';}}}
function applySection(i,anim){var el=document.getElementById('ss'+i);setT(el,'translateY('+(-1080*secIdx[i])+'px)');pagers(i);if(anim)play(document.getElementById('sc'+i+'_'+secIdx[i]));}
var moveTimer=null;
function goSlide(i,anim){cur=(i+5)%5;setT(track,'translateX('+(-1920*cur)+'px)');lastSwitch=new Date().getTime();
  if(anim!==false){addClass(stage,'moving');if(moveTimer)clearTimeout(moveTimer);moveTimer=setTimeout(function(){rmClass(stage,'moving');},650);}
  play(document.getElementById('sc'+cur+'_'+secIdx[cur]));
  if(paused)drawPause();}
function play(root){if(!root)return;rmClass(root,'play');rmClass(root,'settled');void root.offsetWidth;
  var all=root.getElementsByTagName('div'),bi=0,ci=0,mi=0,k;
  for(k=0;k<all.length;k++){var e=all[k],dly=-1;
    if(hasClass(e,'bar')){dly=200+bi*60;bi++;}else if(hasClass(e,'hcol')){dly=200+Math.min(ci*20,600);ci++;}else if(hasClass(e,'mask')){dly=200+mi*150;mi++;}else if(hasClass(e,'fill')){dly=250;}
    if(dly>=0){e.style.webkitAnimationDelay=dly+'ms';e.style.animationDelay=dly+'ms';}}
  raf(function(){addClass(root,'play');});
  var cs=root.getElementsByTagName('span'),n=0;for(k=0;k<cs.length&&n<3;k++){if(hasClass(cs[k],'cu')){countUp(cs[k]);n++;}}}
function fmt(v){return String(v).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function countUp(el,from){var to=+el.getAttribute('data-v'),pre=el.getAttribute('data-p')||'',steps=12,i=0;from=from||0;
  if(noMotion||to===from){el.innerHTML=pre+fmt(Math.round(to));return;}
  el.innerHTML=pre+fmt(Math.round(from));
  function tick(){i++;el.innerHTML=pre+fmt(Math.round(from+(to-from)*i/steps));if(i<steps){window.setTimeout(tick,50);}}
  window.setTimeout(tick,200);}

/* ---------- pause overlay ---------- */
function drawPause(){var p=document.getElementById('pause');
  p.innerHTML='<div class="a" style="left:560px;top:250px;width:800px;height:580px;background:#0B0F10"></div>'+frame(560,250,800,580,'',A)+
  ab('lab',620,290,0,'','JARVIS :: SYS.PAUSE')+ab('so',560,350,800,'text-align:center;font-size:120px','PAUSED')+
  ab('lab',560,500,800,'text-align:center','SLIDE 0'+(cur+1)+' / 05 &middot; <span class="w">'+NAMES[cur]+'</span>')+dots(cur,810,556)+
  '<div class="a" style="left:620px;top:620px;width:680px;height:1px;background:'+HL+'"></div>'+
  ab('t',620,650,0,'line-height:56px;font-size:36px','<span class="c">OK</span> &nbsp;&nbsp;resume<br><span class="c">&#9664; &#9654;</span> &nbsp;slide &nbsp;&nbsp;&nbsp;&nbsp;<span class="c">&#9650; &#9660;</span> &nbsp;scroll');}
function setPause(on){paused=on;var p=document.getElementById('pause'),d=document.getElementById('dim');
  if(on){drawPause();addClass(p,'on');addClass(d,'on');}else{rmClass(p,'on');rmClass(d,'on');lastSwitch=new Date().getTime();}}

/* ---------- input ---------- */
function onKey(e){e=e||window.event;var k=e.keyCode||e.which,handled=true;lastInput=new Date().getTime();
  if(nightOn&&!Q.night){setNight(false,true);}
  if(k===39){secIdx[(cur+1)%5]=0;applySection((cur+1)%5,false);goSlide(cur+1);}
  else if(k===37){secIdx[(cur+4)%5]=0;applySection((cur+4)%5,false);goSlide(cur-1);}
  else if(k===40){if(secIdx[cur]<1){secIdx[cur]=1;applySection(cur,true);}}
  else if(k===38){if(secIdx[cur]>0){secIdx[cur]=0;applySection(cur,true);}}
  else if(k>=49&&k<=53){goSlide(k-49);}
  else if(k>=97&&k<=101){goSlide(k-97);}
  else if(k===13){setPause(!paused);}
  else handled=false;
  if(handled&&e.preventDefault)e.preventDefault();
  if(handled)return false;}
document.onkeydown=onKey;

/* ---------- night mode 1 to 5 AM ---------- */
var nightWoke=0;
function setNight(on,wake){var nl=document.getElementById('night');if(wake)nightWoke=new Date().getTime();if(on===nightOn)return;nightOn=on;
  if(on){addClass(nl,'on');addClass(stage,'isnight');}else{rmClass(nl,'on');rmClass(stage,'isnight');}}
function drift(){var x=Math.round(Math.random()*48-24),y=Math.round(Math.random()*32-16);setT(document.getElementById('nclock'),'translate('+x+'px,'+y+'px)');}

/* ---------- clock tick + rotation ---------- */
var lastMin='';
function tick(){var n=now(),t=hm(n),i,els=stage.getElementsByTagName('span');
  if(ymd(n)+t!==lastMin){var first=!lastMin;lastMin=ymd(n)+t;if(!first){HAB=null;refresh();updDate();}}
  var real=new Date();if(real.getHours()===3&&real.getMinutes()===30&&real.getTime()-LOADED>3600000){window.location.reload(true);return;}
  for(i=0;i<els.length;i++){if(hasClass(els[i],'hdr'))els[i].innerHTML=wxText(true)+' / AMES &middot; '+t;}
  var dv=stage.getElementsByTagName('div');for(i=0;i<dv.length;i++){if(hasClass(dv[i],'clk'))dv[i].innerHTML=t;}
  document.getElementById('ntime').innerHTML=t;document.getElementById('ndate').innerHTML=DAYS[n.getDay()]+' '+pad(n.getMonth()+1)+'-'+pad(n.getDate());
  var h=n.getHours(),want=Q.night==='1'||(h>=1&&h<5&&new Date().getTime()-nightWoke>IDLE_MS);setNight(want);
  var ms=new Date().getTime();
  if(!paused&&!nightOn&&Q.still!=='1'&&ms-lastInput>=IDLE_MS&&ms-lastSwitch>=ROTATE_MS){var nx=(cur+1)%5;secIdx[nx]=0;applySection(nx,false);goSlide(nx);}}

/* ---------- scale stage to window ---------- */
function fit(){var w=window.innerWidth||document.documentElement.clientWidth,h=window.innerHeight||document.documentElement.clientHeight,s=Math.min(w/1920,h/1080);
  stage.style.left=Math.round((w-1920*s)/2)+'px';stage.style.top=Math.round((h-1080*s)/2)+'px';setT(stage,'scale('+s+')');}
window.onresize=fit;

/* ---------- data loading ---------- */
function loadAll(first){var v=new Date().getTime();getJSON('data.json?v='+v,function(j,raw){DATA=j;RAWD=raw;HAB=null;lastSync=new Date();
    getJSON(((j.config&&j.config.eventsFile)||'events.json')+'?v='+v,function(ev,rawE){EVENTS=ev.events||[];RAWE=rawE;done();},function(){EVENTS=[];done();},true);},
  function(){if(first){stage.innerHTML='<div class="a lab" style="left:64px;top:48px">JARVIS :: data.json could not load. Run sh serve.sh and open http://&lt;laptop-ip&gt;:8000/</div>';}});
  function done(){if(!paused||first)render();if(first){afterFirst();}}}
function loadWx(){var c=(DATA&&DATA.config)||{},lat=c.lat||42.03,lon=c.lon||-93.62;
  getJSON('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current_weather=true&daily=temperature_2m_max&temperature_unit=fahrenheit&timezone=America%2FChicago&forecast_days=1',
    function(j){if(j.current_weather){WX={t:j.current_weather.temperature,code:j.current_weather.weathercode,hi:j.daily&&j.daily.temperature_2m_max?j.daily.temperature_2m_max[0]:j.current_weather.temperature};WXFAIL=false;updWx();}},
    function(){WXFAIL=true;updWx();});}
function updDate(){var els=stage.getElementsByTagName('div'),i,n=now();for(i=0;i<els.length;i++){if(hasClass(els[i],'dateln')){els[i].innerHTML=DAYS[n.getDay()]+' '+ymd(n)+' &middot; '+wxText(false);}}}
function updWx(){updDate();tick();}
/* poll data.json + events.json; re-render only when the raw text changed; keep last data on failure */
function poll(){var v=new Date().getTime();
  getJSON('data.json?v='+v,function(j,raw){var ef=((j.config&&j.config.eventsFile)||'events.json');
    getJSON(ef+'?v='+v,function(ev,rawE){synced(j,raw,ev.events||[],rawE);},function(){synced(j,raw,EVENTS,RAWE);},true);},
    function(){syncFail=true;refresh();},true);}
function synced(j,raw,ev,rawE){var ch=(raw!==RAWD||rawE!==RAWE);syncFail=false;lastSync=new Date();
  if(ch){RAWD=raw;RAWE=rawE;DATA=j;EVENTS=ev;HAB=null;}refresh();}
function clockLoop(){tick();var ms=new Date().getTime()%1000;window.setTimeout(clockLoop,1000-ms+15);}
function afterFirst(){
  if(Q.slide){cur=Math.max(0,Math.min(4,(+Q.slide)-1));}
  if(Q.section==='2'){secIdx[cur]=1;applySection(cur,false);}
  goSlide(cur,false);
  if(Q.pause==='1')setPause(true);
  clockLoop();
  if(Q.wx!=='0'){loadWx();setInterval(loadWx,15*60000);}else{WXFAIL=true;updWx();}
  setInterval(poll,POLL_MS);
  setInterval(drift,600000);
  /* auto no-motion if the first 30 frames are slow */
  if(!noMotion&&Q.motion!=='1'){var f=0,t0=new Date().getTime();(function fr(){f++;if(f<30){raf(fr);}else if((new Date().getTime()-t0)/30>40){noMotion=true;addClass(document.body,'no-motion');}})();}}

if(noMotion)addClass(document.body,'no-motion');
fit();loadAll(true);
window.JARVIS={go:goSlide,key:function(k){onKey({keyCode:k});},poll:poll,state:function(){return {slide:cur,lastSync:lastSync?hm(lastSync):null,syncFail:syncFail,section:secIdx[cur],paused:paused,night:nightOn,noMotion:noMotion};}};
})();
