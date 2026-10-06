/* GpxLens engine: parse GPX tracks and compute stats. Minimal XML
   tokenizer (runs in browser and Node), haversine distance, elevation
   gain/loss, duration and speed. No dependencies. */
(function(root,factory){
  if(typeof module==='object'&&module.exports){module.exports=factory();}
  else{root.GpxLens=factory();}
})(typeof self!=='undefined'?self:this,function(){
'use strict';
var EARTH_R=6371000;
function haversine(a,b){
  var la1=a[0]*Math.PI/180,la2=b[0]*Math.PI/180;
  var dla=(b[0]-a[0])*Math.PI/180,dlo=(b[1]-a[1])*Math.PI/180;
  var h=Math.sin(dla/2)*Math.sin(dla/2)+Math.cos(la1)*Math.cos(la2)*Math.sin(dlo/2)*Math.sin(dlo/2);
  return 2*EARTH_R*Math.asin(Math.min(1,Math.sqrt(h)));
}
/* tiny XML element tokenizer: returns {tags:[{name,attrs,close,self}],texts} via callback-free walk */
function parseXml(s,warn){
  var root={name:'',children:[],attrs:{},text:''};
  var stack=[root];
  var re=/<(\/?)([a-zA-Z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g,m;
  while((m=re.exec(s))!==null){
    if(m[4]!==undefined){stack[stack.length-1].text+=m[4];continue;}
    var closing=m[1]==='/',name=m[2],raw=m[3]||'';
    if(closing){
      for(var i=stack.length-1;i>0;i--){
        if(stack[i].name===name){stack.length=i;break;}
      }
      if(i===0)warn('unmatched closing tag </'+name+'>');
      continue;
    }
    var self=/\/\s*$/.test(raw);
    var attrStr=raw.replace(/\/\s*$/,'');
    var attrs={},am,are=/([a-zA-Z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    while((am=are.exec(attrStr))!==null)attrs[am[1]]=am[3]!==undefined?am[3]:am[4];
    if(/^xml$|^\?/.test(name))continue;
    var el={name:name,children:[],attrs:attrs,text:''};
    stack[stack.length-1].children.push(el);
    if(!self)stack.push(el);
  }
  if(stack.length>1)warn('unclosed XML elements at end of file');
  return root;
}
function kids(el,name){return el.children.filter(function(c){return c.name===name;});}
function childText(el,name){var k=kids(el,name);return k.length?k[0].text.trim():null;}
function fmt(iso){var t=Date.parse(iso);return isNaN(t)?null:t;}
function segStats(pts,warnings){
  var dist=0,gain=0,loss=0,minEle=null,maxEle=null,eleN=0;
  for(var i=1;i<pts.length;i++)dist+=haversine([pts[i-1].lat,pts[i-1].lon],[pts[i].lat,pts[i].lon]);
  for(var j=0;j<pts.length;j++){
    var e=pts[j].ele;
    if(e===null)continue;
    eleN++;
    if(minEle===null||e<minEle)minEle=e;
    if(maxEle===null||e>maxEle)maxEle=e;
    if(j>0&&pts[j-1].ele!==null){
      var d=e-pts[j-1].ele;
      if(d>0)gain+=d;else loss-=d;
    }
  }
  var t0=null,t1=null;
  for(var a=0;a<pts.length;a++){if(pts[a].time!==null){t0=pts[a].time;break;}}
  for(var b=pts.length-1;b>=0;b--){if(pts[b].time!==null){t1=pts[b].time;break;}}
  var dur=(t0!==null&&t1!==null)?(t1-t0)/1000:null;
  if(eleN>0&&eleN<pts.length)warnings.push('segment has '+eleN+' of '+pts.length+' points with elevation');
  return {points:pts.length,distance_m:dist,gain_m:gain,loss_m:loss,
    min_ele:minEle,max_ele:maxEle,duration_s:dur,
    avg_speed:(dur&&dur>0)?dist/dur:null,ele_points:eleN,pts:pts};
}
function parse(text){
  var r={errors:[],warnings:[],tracks:[],waypoints:[],routes:[]};
  var root;
  try{root=parseXml(text,r.warnings);}catch(e){r.errors.push('XML parse failed');return r;}
  var gpx=kids(root,'gpx');
  if(!gpx.length){r.errors.push('no <gpx> root element found');return r;}
  var g=gpx[0];
  r.creator=g.attrs.creator||null;
  r.version=g.attrs.version||null;
  kids(g,'trk').forEach(function(trk,ti){
    var name=childText(trk,'name');
    var segs=[];
    kids(trk,'trkseg').forEach(function(seg){
      var pts=[];
      kids(seg,'trkpt').forEach(function(p){
        var lat=parseFloat(p.attrs.lat),lon=parseFloat(p.attrs.lon);
        if(isNaN(lat)||isNaN(lon)){r.warnings.push('skipped point with bad coordinates');return;}
        var eleT=childText(p,'ele'),timeT=childText(p,'time');
        var ele=eleT===null?null:parseFloat(eleT);
        if(eleT!==null&&isNaN(ele)){r.warnings.push('skipped bad elevation value');ele=null;}
        var time=timeT===null?null:fmt(timeT);
        if(timeT!==null&&time===null){r.warnings.push('unparseable timestamp: '+timeT);}
        pts.push({lat:lat,lon:lon,ele:ele,time:time});
      });
      if(pts.length)segs.push(segStats(pts,r.warnings));
    });
    if(!segs.length){r.warnings.push('track '+(name||ti+1)+' has no usable points');return;}
    var tot={name:name,segments:segs,points:0,distance_m:0,gain_m:0,loss_m:0,duration_s:0};
    segs.forEach(function(s){tot.points+=s.points;tot.distance_m+=s.distance_m;tot.gain_m+=s.gain_m;tot.loss_m+=s.loss_m;if(s.duration_s)tot.duration_s+=s.duration_s;});
    tot.avg_speed=tot.duration_s>0?tot.distance_m/tot.duration_s:null;
    var eles=segs.filter(function(s){return s.min_ele!==null;});
    tot.min_ele=eles.length?Math.min.apply(null,eles.map(function(s){return s.min_ele;})):null;
    tot.max_ele=eles.length?Math.max.apply(null,eles.map(function(s){return s.max_ele;})):null;
    r.tracks.push(tot);
  });
  kids(g,'wpt').forEach(function(w){
    var lat=parseFloat(w.attrs.lat),lon=parseFloat(w.attrs.lon);
    if(isNaN(lat)||isNaN(lon))return;
    r.waypoints.push({lat:lat,lon:lon,name:childText(w,'name')});
  });
  kids(g,'rte').forEach(function(rt){
    var n=kids(rt,'rtept').length;
    r.routes.push({name:childText(rt,'name'),points:n});
  });
  return r;
}
return {parse:parse,haversine:haversine};
});
