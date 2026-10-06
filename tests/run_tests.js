/* GpxLens tests: shared engine over the corpus vs tests/expected.json
   (independent python ElementTree + haversine oracle). */
'use strict';
const fs=require('fs'),path=require('path');
const engine=require(path.join(__dirname,'..','engine.js'));
const items=JSON.parse(fs.readFileSync(path.join(__dirname,'expected.json'),'utf8')).items;
let fail=0,pass=0;
function eq(a,b,label){
  if(JSON.stringify(a)===JSON.stringify(b)){pass++;return;}
  fail++;console.log('FAIL '+label+': got '+JSON.stringify(a)+' want '+JSON.stringify(b));
}
function close(a,b,tol){return (a===null&&b===null)||(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<=tol);}
function eqNear(a,b,label){
  if(close(a,b,0.02)){pass++;return;}
  fail++;console.log('FAIL '+label+': got '+a+' want '+b);
}
for(const item of items){
  const text=fs.readFileSync(path.join(__dirname,'corpus',item.file),'utf8');
  const r=engine.parse(text);
  const T=item.file+' ';
  if(item.expect_error){
    if(r.errors.some(e=>e.indexOf(item.expect_error)>=0))pass++;
    else{fail++;console.log('FAIL '+T+'missing error got '+JSON.stringify(r.errors));}
    continue;
  }
  if(item.expect_warning){
    if(r.warnings.some(w=>w.indexOf(item.expect_warning)>=0))pass++;
    else{fail++;console.log('FAIL '+T+'missing warning got '+JSON.stringify(r.warnings));}
    continue;
  }
  eq(r.errors.length,0,T+'errors');
  eq(r.creator,item.creator,T+'creator');
  eq(r.version,item.version,T+'version');
  eq(r.tracks.length,item.track_count,T+'track_count');
  eq(r.waypoints.length,item.waypoint_count,T+'waypoints');
  eq(r.routes.length,item.route_count,T+'routes');
  item.tracks.forEach((want,i)=>{
    const got=r.tracks[i],TT=T+'track'+(i+1)+' ';
    eq(got.name,want.name,TT+'name');
    eq(got.points,want.points,TT+'points');
    eqNear(got.distance_m,want.distance_m,TT+'distance_m');
    eqNear(got.gain_m,want.gain_m,TT+'gain_m');
    eqNear(got.loss_m,want.loss_m,TT+'loss_m');
    eq(got.min_ele,want.min_ele,TT+'min_ele');
    eq(got.max_ele,want.max_ele,TT+'max_ele');
    eqNear(got.duration_s,want.duration_s,TT+'duration_s');
    eqNear(got.avg_speed,want.avg_speed,TT+'avg_speed');
    eq(got.segments.length,want.segments.length,TT+'segment count');
    want.segments.forEach((ws,j)=>{
      const gs=got.segments[j],TS=TT+'seg'+(j+1)+' ';
      eq(gs.points,ws.points,TS+'points');
      eqNear(gs.distance_m,ws.distance_m,TS+'distance_m');
      eqNear(gs.gain_m,ws.gain_m,TS+'gain_m');
      eqNear(gs.duration_s,ws.duration_s,TS+'duration_s');
      eq(gs.ele_points,ws.ele_points,TS+'ele_points');
    });
  });
}
console.log(pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
