mermaid.initialize({
  theme: "base",
  startOnLoad: false,
  themeVariables: {
    background: "#ffffff",
    primaryColor: "#ffffff",
    primaryBorderColor: "#000000",
    primaryTextColor: "#000000",
    secondaryColor: "#ffffff",
    secondaryBorderColor: "#000000",
    secondaryTextColor: "#000000",
    tertiaryColor: "#ffffff",
    tertiaryBorderColor: "#000000",
    tertiaryTextColor: "#000000",
    lineColor: "#000000",
    arrowheadColor: "#000000",
    textColor: "#000000",
    titleColor: "#000000",
    nodeBkg: "#ffffff",
    nodeBorder: "#000000",
    nodeTextColor: "#000000",
    clusterBkg: "#ffffff",
    clusterBorder: "#000000",
    defaultLinkColor: "#000000",
    edgeLabelBackground: "#ffffff",
    border1: "#000000",
    border2: "#000000",
    mainBkg: "#ffffff",
    secondBkg: "#ffffff",
    actorBorder: "#000000",
    actorBkg: "#ffffff",
    actorTextColor: "#000000",
    actorLineColor: "#000000",
    signalColor: "#000000",
    signalTextColor: "#000000",
    labelBoxBkgColor: "#ffffff",
    labelBoxBorderColor: "#000000",
    labelTextColor: "#000000",
    loopTextColor: "#000000",
    noteBorderColor: "#000000",
    noteBkgColor: "#ffffff",
    noteTextColor: "#000000",
    activationBorderColor: "#000000",
    activationBkgColor: "#ffffff",
    sequenceNumberColor: "#000000",
    sectionBkgColor: "#ffffff",
    altSectionBkgColor: "#ffffff",
    sectionBkgColor2: "#ffffff",
    excludeBkgColor: "#ffffff",
    taskBorderColor: "#000000",
    taskBkgColor: "#ffffff",
    activeTaskBorderColor: "#000000",
    activeTaskBkgColor: "#ffffff",
    gridColor: "#000000",
    doneTaskBkgColor: "#ffffff",
    doneTaskBorderColor: "#000000",
    critBkgColor: "#ffffff",
    critBorderColor: "#000000",
    todayLineColor: "#000000",
    vertLineColor: "#000000",
    taskTextColor: "#000000",
    taskTextOutsideColor: "#000000",
    taskTextLightColor: "#000000",
    taskTextDarkColor: "#000000",
    taskTextClickableColor: "#000000",
    personBorder: "#000000",
    personBkg: "#ffffff",
    rowOdd: "#ffffff",
    rowEven: "#ffffff",
    labelColor: "#000000",
    errorBkgColor: "#ffffff",
    errorTextColor: "#000000",
    classText: "#000000",
    stateLabelColor: "#000000",
    stateBkg: "#ffffff",
    labelBackgroundColor: "#ffffff",
    compositeBackground: "#ffffff",
    altBackground: "#ffffff",
    compositeTitleBackground: "#ffffff",
    compositeBorder: "#000000",
    innerEndBackground: "#ffffff",
    stateBorder: "#000000",
    specialStateColor: "#000000",
    rectBkgColor: "#ffffff",
    transitionColor: "#000000",
    transitionLabelColor: "#000000",
    requirementBackground: "#ffffff",
    requirementBorderColor: "#000000",
    requirementTextColor: "#000000",
    relationColor: "#000000",
    relationLabelBackground: "#ffffff",
    relationLabelColor: "#000000",
    git0: "#ffffff",
    git1: "#dddddd",
    git2: "#ffffff",
    git3: "#dddddd",
    git4: "#ffffff",
    git5: "#dddddd",
    git6: "#ffffff",
    git7: "#dddddd",
    gitInv0: "#000000",
    gitInv1: "#222222",
    gitInv2: "#000000",
    gitInv3: "#222222",
    gitInv4: "#000000",
    gitInv5: "#222222",
    gitInv6: "#000000",
    gitInv7: "#222222",
    branchLabelColor: "#000000",
    gitBranchLabel0: "#ffffff",
    gitBranchLabel1: "#ffffff",
    gitBranchLabel2: "#ffffff",
    gitBranchLabel3: "#ffffff",
    gitBranchLabel4: "#ffffff",
    gitBranchLabel5: "#ffffff",
    gitBranchLabel6: "#ffffff",
    gitBranchLabel7: "#ffffff",
    tagLabelColor: "#000000",
    tagLabelBackground: "#ffffff",
    tagLabelBorder: "#000000",
    commitLabelColor: "#000000",
    commitLabelBackground: "#ffffff",
    pie1: "#ffffff",
    pie2: "#dddddd",
    pie3: "#bbbbbb",
    pie4: "#999999",
    pie5: "#777777",
    pie6: "#000000",
    pie7: "#ffffff",
    pie8: "#dddddd",
    pie9: "#bbbbbb",
    pie10: "#999999",
    pie11: "#777777",
    pie12: "#000000",
    pieTitleTextColor: "#000000",
    pieSectionTextColor: "#000000",
    pieLegendTextColor: "#000000",
    pieStrokeColor: "#000000",
    pieOuterStrokeColor: "#000000",
    useGradient: false,
    dropShadow: "none",
  },
});
mermaid.run({ querySelector: ".mermaid" });
(function() {
var COLORS=[
  '#4c9aff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8',
  '#20c997', '#ff922b', '#748ffc', '#f06595', '#9775fa'
];
function parseChartDSL(t){
var L=t.trim().split("\n").map(function(l){return l.trim()}).filter(function(l){return l});
var ty="column",ti="",xl="",yl="",i,m;
for(i=0;i<L.length;i++){
if(m=L[i].match(/^type:\s*(.+)/i))ty=m[1].trim().toLowerCase();
else if(m=L[i].match(/^title:\s*(.+)/i))ti=m[1].trim();
else if(m=L[i].match(/^xlabel:\s*(.+)/i))xl=m[1].trim();
else if(m=L[i].match(/^ylabel:\s*(.+)/i))yl=m[1].trim();
else break}
var T=L.filter(function(l){return l.startsWith("|")});
if(T.length<2)return null;
if(ty==="scatter"){
var D={},C2=[],c,x,y;
for(i=1;i<T.length;i++){
c=T[i].split("|").filter(function(v){return v.trim()}).map(function(v){return v.trim()});
if(c.length<2)continue;x=parseFloat(c[0]);y=parseFloat(c[1]);
if(!isNaN(x)&&!isNaN(y)){
if(c.length>=3&&c[2]){if(!D[c[2]]){D[c[2]]=[];C2.push(c[2])}D[c[2]].push({x:x,y:y})}
else{if(!D._)D._=[];D._.push({x:x,y:y})}}}
if(C2.length===0){var V=D._||[];return V.length?{type:ty,title:ti,xlabel:xl,ylabel:yl,labels:null,values:V,scatterMode:"simple"}:null}
return{type:ty,title:ti,xlabel:xl,ylabel:yl,labels:null,datasets:C2.map(function(cat,idx){return{label:cat,data:D[cat],backgroundColor:COLORS[idx%COLORS.length],borderColor:COLORS[idx%COLORS.length]}}),scatterMode:"grouped"}}
var La=[],Va=[];
for(i=1;i<T.length;i++){
c=T[i].split("|").filter(function(v){return v.trim()}).map(function(v){return v.trim()});
if(c.length<2)continue;
var v=parseFloat(c[1]);
if(!isNaN(v)){La.push(c[0]);Va.push(v)}}
return La.length?{type:ty,title:ti,xlabel:xl,ylabel:yl,labels:La,values:Va}:null}
function renderChart(t,i){
var e=document.getElementById(i);if(!e)return;
var d=parseChartDSL(t);if(!d||d.error){if(d&&d.error==='nonumeric'){e.innerHTML='<p style="color:#ff6b6b">Ошибка: значения должны быть числами</p>';return}e.innerHTML='<p style="color:#ff6b6b">Ошибка: не удалось разобрать данные</p>';return}
e.innerHTML="";var cv=document.createElement("canvas");e.appendChild(cv);var cfg;
switch(d.type){
case"column":cfg={type:"bar",data:{labels:d.labels,datasets:[{label:d.title||"Values",data:d.values,backgroundColor:COLORS.slice(0,d.labels.length),borderColor:COLORS.slice(0,d.labels.length),borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:!!d.title,text:d.title,color:"#e1e1e1"},legend:{display:false}}}};break;
case"line":cfg={type:"line",data:{labels:d.labels,datasets:[{label:d.title||"Values",data:d.values,borderColor:COLORS[0],backgroundColor:COLORS[0]+"22",fill:true,tension:0.3,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:!!d.title,text:d.title,color:"#e1e1e1"},legend:{display:false}}}};break;
case"pie":cfg={type:"pie",data:{labels:d.labels,datasets:[{data:d.values,backgroundColor:COLORS.slice(0,d.labels.length),borderColor:"#ffffff",borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:!!d.title,text:d.title,color:"#e1e1e1"},legend:{labels:{color:"#000000"}},tooltip:{callbacks:{label:function(ctx){var t=ctx.dataset.data.reduce(function(a,b){return a+b},0);return ctx.label+": "+ctx.parsed+" ("+((ctx.parsed/t)*100).toFixed(1)+"%)"}}}}}};break;
case"scatter":if(d.scatterMode==="grouped"){cfg={type:"scatter",data:{datasets:d.datasets.map(function(ds){return{label:ds.label,data:ds.data,backgroundColor:ds.backgroundColor,borderColor:ds.borderColor,pointRadius:3.5,pointHoverRadius:6}})},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:!!d.title,text:d.title,color:"#e1e1e1"},legend:{labels:{color:"#000000"}}},scales:{x:{grid:{color:"#333"},title:{display:!!d.xlabel,text:d.xlabel||"X",color:"#000000"}},y:{grid:{color:"#333"},title:{display:!!d.ylabel,text:d.ylabel||"Y",color:"#000000"}}}}}}else{cfg={type:"scatter",data:{datasets:[{label:d.title||"Data",data:d.values,backgroundColor:COLORS[0],borderColor:COLORS[0],pointRadius:3.5,pointHoverRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:!!d.title,text:d.title,color:"#e1e1e1"},legend:{display:false}},scales:{x:{grid:{color:"#333"},title:{display:!!d.xlabel,text:d.xlabel||"X",color:"#000000"}},y:{grid:{color:"#333"},title:{display:!!d.ylabel,text:d.ylabel||"Y",color:"#000000"}}}}}};break;
case"radar":cfg={type:"radar",data:{labels:d.labels,datasets:[{label:d.title||"Values",data:d.values,backgroundColor:COLORS[0]+"33",borderColor:COLORS[0],pointBackgroundColor:COLORS[0],pointBorderColor:"#ffffff",pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:!!d.title,text:d.title,color:"#e1e1e1"},legend:{display:false}},scales:{r:{grid:{color:"#333"},angleLines:{color:"#333"},pointLabels:{color:"#000000"},beginAtZero:true,ticks:{display:false,stepSize:1}}}}};break}
if(cfg)new Chart(cv.getContext("2d"),cfg)}
document.querySelectorAll("[data-chart-code]").forEach(function(e){
var c=decodeURIComponent(e.getAttribute("data-chart-code")||"");
if(c)renderChart(c,e.id)});
})();