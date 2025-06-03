import{p as B}from"./CmyHogV_.js";import{ab as x,ae as z,b4 as U,_ as u,u as j,r as Q,v as Z,w as q,Q as H,P as J,z as F,x as K,a1 as X,a5 as Y,ap as tt,A as et,V as at,a3 as rt}from"./B_PHts45.js";import{p as nt}from"./inQU9WWZ.js";import{d as O}from"./CqLIDLjJ.js";import{o as it}from"./CmKTTxBW.js";function st(t,a){return a<t?-1:a>t?1:a>=t?0:NaN}function ot(t){return t}function lt(){var t=ot,a=st,h=null,o=x(0),p=x(z),y=x(0);function i(e){var r,l=(e=U(e)).length,g,A,m=0,c=new Array(l),n=new Array(l),v=+o.apply(this,arguments),w=Math.min(z,Math.max(-z,p.apply(this,arguments)-v)),f,T=Math.min(Math.abs(w)/l,y.apply(this,arguments)),$=T*(w<0?-1:1),d;for(r=0;r<l;++r)(d=n[c[r]=r]=+t(e[r],r,e))>0&&(m+=d);for(a!=null?c.sort(function(S,C){return a(n[S],n[C])}):h!=null&&c.sort(function(S,C){return h(e[S],e[C])}),r=0,A=m?(w-l*$)/m:0;r<l;++r,v=f)g=c[r],d=n[g],f=v+(d>0?d*A:0)+$,n[g]={data:e[g],index:r,value:d,startAngle:v,endAngle:f,padAngle:T};return n}return i.value=function(e){return arguments.length?(t=typeof e=="function"?e:x(+e),i):t},i.sortValues=function(e){return arguments.length?(a=e,h=null,i):a},i.sort=function(e){return arguments.length?(h=e,a=null,i):h},i.startAngle=function(e){return arguments.length?(o=typeof e=="function"?e:x(+e),i):o},i.endAngle=function(e){return arguments.length?(p=typeof e=="function"?e:x(+e),i):p},i.padAngle=function(e){return arguments.length?(y=typeof e=="function"?e:x(+e),i):y},i}var ct=rt.pie,G={sections:new Map,showData:!1},E=G.sections,P=G.showData,ut=structuredClone(ct),pt=u(()=>structuredClone(ut),"getConfig"),gt=u(()=>{E=new Map,P=G.showData,at()},"clear"),dt=u(({label:t,value:a})=>{E.has(t)||(E.set(t,a),F.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),ft=u(()=>E,"getSections"),ht=u(t=>{P=t},"setShowData"),mt=u(()=>P,"getShowData"),R={getConfig:pt,clear:gt,setDiagramTitle:J,getDiagramTitle:H,setAccTitle:q,getAccTitle:Z,setAccDescription:Q,getAccDescription:j,addSection:dt,getSections:ft,setShowData:ht,getShowData:mt},vt=u((t,a)=>{B(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),St={parse:u(async t=>{const a=await nt("pie",t);F.debug(a),vt(a,R)},"parse")},xt=u(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),yt=xt,At=u(t=>{const a=[...t.entries()].map(o=>({label:o[0],value:o[1]})).sort((o,p)=>p.value-o.value);return lt().value(o=>o.value)(a)},"createPieArcs"),wt=u((t,a,h,o)=>{F.debug(`rendering pie chart
`+t);const p=o.db,y=K(),i=X(p.getConfig(),y.pie),e=40,r=18,l=4,g=450,A=g,m=Y(a),c=m.append("g");c.attr("transform","translate("+A/2+","+g/2+")");const{themeVariables:n}=y;let[v]=tt(n.pieOuterStrokeWidth);v??(v=2);const w=i.textPosition,f=Math.min(A,g)/2-e,T=O().innerRadius(0).outerRadius(f),$=O().innerRadius(f*w).outerRadius(f*w);c.append("circle").attr("cx",0).attr("cy",0).attr("r",f+v/2).attr("class","pieOuterCircle");const d=p.getSections(),S=At(d),C=[n.pie1,n.pie2,n.pie3,n.pie4,n.pie5,n.pie6,n.pie7,n.pie8,n.pie9,n.pie10,n.pie11,n.pie12],D=it(C);c.selectAll("mySlices").data(S).enter().append("path").attr("d",T).attr("fill",s=>D(s.data.label)).attr("class","pieCircle");let W=0;d.forEach(s=>{W+=s}),c.selectAll("mySlices").data(S).enter().append("text").text(s=>(s.data.value/W*100).toFixed(0)+"%").attr("transform",s=>"translate("+$.centroid(s)+")").style("text-anchor","middle").attr("class","slice"),c.append("text").text(p.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText");const M=c.selectAll(".legend").data(D.domain()).enter().append("g").attr("class","legend").attr("transform",(s,b)=>{const k=r+l,L=k*D.domain().length/2,_=12*r,V=b*k-L;return"translate("+_+","+V+")"});M.append("rect").attr("width",r).attr("height",r).style("fill",D).style("stroke",D),M.data(S).append("text").attr("x",r+l).attr("y",r-l).text(s=>{const{label:b,value:k}=s.data;return p.getShowData()?`${b} [${k}]`:b});const I=Math.max(...M.selectAll("text").nodes().map(s=>(s==null?void 0:s.getBoundingClientRect().width)??0)),N=A+e+r+l+I;m.attr("viewBox",`0 0 ${N} ${g}`),et(m,g,N,i.useMaxWidth)},"draw"),Ct={draw:wt},Et={parser:St,db:R,renderer:Ct,styles:yt};export{Et as diagram};
