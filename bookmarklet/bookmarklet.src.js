(()=>{
const SERVER='__SERVER_ORIGIN__';
const M={January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12};
const T=e=>e?e.textContent.replace(/\s+/g,' ').trim():'';
const iso=s=>{const m=String(s).match(/(\d{1,2}) ([A-Za-z]+) (\d{4})/);return m&&M[m[2]]?m[3]+'-'+String(M[m[2]]).padStart(2,'0')+'-'+m[1].padStart(2,'0'):null};
const num=s=>{const n=parseFloat(s);return isNaN(n)?null:n};
const flag=c=>{const e=c&&c.querySelector('[aria-label]');const v=e?e.getAttribute('aria-label'):T(c);return v==='No'?false:v==='Yes'?true:(v||null)};
const t=document.querySelector('table.learner-table')||document.querySelector('table');
if(!t){alert('Keine Gradebook-Tabelle gefunden');return}
const hr=[...t.tHead.rows].pop();
const H=[...hr.cells].map(th=>{const b=th.querySelector('[data-testid="assignmentsHeader"]');return b?{kind:'assessment',name:b.getAttribute('aria-label')||T(b),dueDate:iso(T(th.querySelector('[class*="fontSize_12"]')))}:{kind:'field',name:T(th)}});
const ix=n=>H.findIndex(h=>h.kind==='field'&&h.name===n);
const iL=ix('Learner'),iG=ix('Class Grade (\x25)'),iE=ix('Final Exam Score'),iF=ix('Final Exam Submitted'),iS=ix('Survey Submitted'),iC=ix('Marked Complete');
if(iL<0){alert('Spalte Learner nicht gefunden');return}
const L=[...t.tBodies[0].rows].map(r=>{const c=[...r.cells],lc=c[iL];
const nd=lc.querySelector('[class*="userName"]'),sp=nd?[...nd.querySelectorAll('span')]:[];
const p={name:T(sp[0])||T(nd),email:T(lc.querySelector('[class*="userEmail"]'))||null,status:sp.length>1?T(sp[sp.length-1]):T(lc.querySelector('[class*="userInprogress"]'))||null,
classGrade:iG>=0?num(T(c[iG])):null,finalExamScore:iE>=0?num(T(c[iE])):null,
finalExamSubmitted:iF>=0?flag(c[iF]):null,surveySubmitted:iS>=0?flag(c[iS]):null,markedComplete:iC>=0?flag(c[iC]):null,assessments:[]};
H.forEach((h,i)=>{if(h.kind!=='assessment'||!c[i])return;const g=T(c[i].querySelector('[class*="showgradesPrint"]')||c[i].querySelector('button')).match(/^(--|[\d.]+)\s*\/\s*([\d.]+)/);
p.assessments.push({name:h.name,score:g&&g[1]!=='--'?num(g[1]):null,maxScore:g?num(g[2]):null,submittedOn:iso(T(c[i].querySelector('[class*="fontSize_12"]')))})});
return p}).filter(p=>p.name||p.email);
const h1=document.querySelector('h1[class*="courseTitle"]');const kurs=T(h1)||'Kurs';
const stand=new Date().toLocaleDateString('sv-SE');
const data={format:'netacad-gradebook/1',snapshotDate:stand,exportedAt:new Date().toISOString(),course:kurs,url:location.pathname,courseId:new URLSearchParams(location.search).get('id'),assessments:H.filter(h=>h.kind==='assessment').map(h=>({name:h.name,dueDate:h.dueDate})),learners:L};
const json=JSON.stringify(data,null,2);
if(json.length<1000000){const w=window.open(SERVER+'/import\x23'+encodeURIComponent(json),'_blank');if(w){return;}}
const a=document.createElement('a');
a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
a.download=stand+'-'+kurs.replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,'-')+'_gradebook.json';
a.click();
alert('Import-Tab konnte nicht ge\u00f6ffnet werden. Datei wurde heruntergeladen; bitte unter \u00abDateien\u00bb hochladen.');
})()
