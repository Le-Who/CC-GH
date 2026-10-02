// Presentation only. This module cannot read or mutate game progress.
const TAU = Math.PI * 2;
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const smooth = n => { const v=clamp(n,0,1); return v*v*(3-2*v); };
export const DAISY = Object.freeze({
  root: [0.50, 0.69], pinY: 0.67,
  zones: [
    {tip:[0.54,0.14], base:[0.50,0.67], radius:0.19, amplitude:0.007, phase:0},
    {tip:[0.24,0.30], base:[0.47,0.67], radius:0.17, amplitude:0.008, phase:1.7},
    {tip:[0.79,0.40], base:[0.55,0.67], radius:0.17, amplitude:0.007, phase:3.1},
    {tip:[0.52,0.49], base:[0.51,0.68], radius:0.14, amplitude:0.005, phase:4.2},
    {tip:[0.86,0.24], base:[0.54,0.67], radius:0.11, amplitude:0.006, phase:2.4}
  ]
});
export const MONSTERA = Object.freeze({
  root:[0.5,0.695], pinY:null, pot:[0.305,0.64,0.70,1],
  zones:[
    {tip:[0.40,0.22],base:[0.50,0.69],radius:0.22,amplitude:0.006,phase:0.4},
    {tip:[0.82,0.27],base:[0.51,0.69],radius:0.18,amplitude:0.008,phase:2.1},
    {tip:[0.20,0.51],base:[0.48,0.69],radius:0.19,amplitude:0.007,phase:3.8},
    {tip:[0.80,0.59],base:[0.52,0.69],radius:0.24,amplitude:0.006,phase:5.0},
    {tip:[0.37,0.63],base:[0.49,0.69],radius:0.09,amplitude:0.004,phase:1.2}
  ]
});
export const FERN = Object.freeze({
  root:[0.52,0.64],pinY:null,pot:[0.35,0.63,0.70,1],
  zones:[
    {tip:[0.49,0.08],base:[0.52,0.64],radius:0.12,amplitude:0.006,phase:0.1},
    {tip:[0.25,0.20],base:[0.51,0.64],radius:0.11,amplitude:0.007,phase:1.2},
    {tip:[0.82,0.25],base:[0.53,0.64],radius:0.14,amplitude:0.009,phase:2.5},
    {tip:[0.12,0.40],base:[0.50,0.64],radius:0.13,amplitude:0.008,phase:3.9},
    {tip:[0.88,0.52],base:[0.54,0.64],radius:0.13,amplitude:0.010,phase:5.1},
    {tip:[0.17,0.85],base:[0.49,0.64],radius:0.13,amplitude:0.008,phase:2.0},
    {tip:[0.82,0.85],base:[0.55,0.64],radius:0.13,amplitude:0.008,phase:4.5}
  ]
});
export function isPinned(x,y,config){
  if(config.pinY!==null && y>=config.pinY)return true;
  for(const box of [config.pot,...(config.pins||[])].filter(Boolean)){const [l,t,r,b]=box;if(x>=l&&x<=r&&y>=t&&y<=b)return true;}
  return Math.hypot(x-config.root[0],y-config.root[1])<(config.rootRadius??0.035);
}
export function makeGrid(columns=32, rows=48) {
  if (!Number.isInteger(columns)||!Number.isInteger(rows)||columns<2||rows<2||columns>128||rows>128) throw new RangeError('grid bounds');
  const uv=[], indices=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++)uv.push(x/columns,y/rows);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  return {uv:Float32Array.from(uv),indices:Uint16Array.from(indices),columns,rows};
}
function zoneMotion(zone,time,config,{impulseAge,waterAge,seed}){
 const phase=zone.phase+seed,delay=zone.responseDelay??0;
 const age=impulseAge-delay,waterTime=waterAge-delay*1.5;
 const tap=age>=0&&age<2.2?Math.sin(age*TAU*1.8)*Math.exp(-age*2.4)*(config.tapAmplitude??.055):0;
 const water=waterTime>=0&&waterTime<3.5?Math.sin(waterTime*TAU*.8)*Math.exp(-waterTime*.9)*(config.waterAmplitude??.038):0;
 const bend=zone.amplitude*(.7*Math.sin(time*TAU/5.8+phase)+.3*Math.sin(time*TAU/9.1+phase*1.3));
 // Seed changes calm idle phase only. Deliberate responses cannot disappear at unlucky phases.
 const direction=zone.tip[0]<config.root[0]?-1:1,gain=zone.responseGain??1;
 return [bend+direction*gain*(tap+water*.65),bend*.18*Math.sin(phase)+gain*water*.4];
}
export function sampleMotion(x,y,time,config=DAISY,{reduced=false,impulseAge=Infinity,waterAge=Infinity,seed=0}={}) {
  if (![x,y,time,seed].every(Number.isFinite)) throw new TypeError('finite motion coordinates required');
  if(reduced||isPinned(x,y,config)) return [x,y];
  let rooted=config.pinY!==null?smooth((config.pinY-y)/(config.pinFeather??.14)):smooth((Math.hypot(x-config.root[0],y-config.root[1])-(config.rootRadius??.035))/(config.rootFeather??.16));
  // Feather the spatial pin boundary; never shear a neighbouring triangle.
  for(const box of [config.pot,...(config.pins||[])].filter(Boolean)){const [l,t,r,b]=box;const dist=Math.hypot(Math.max(l-x,0,x-r),Math.max(t-y,0,y-b));rooted*=smooth(dist/(config.potFeather??.065));}
  let dx=0,dy=0,total=0;
  for(const zone of config.zones){
    const vx=zone.tip[0]-zone.base[0],vy=zone.tip[1]-zone.base[1];
    const t=clamp(((x-zone.base[0])*vx+(y-zone.base[1])*vy)/(vx*vx+vy*vy),0,1);
    const px=zone.base[0]+t*vx,py=zone.base[1]+t*vy;
    const dist=Math.hypot(x-px,y-py);
    const weight=Math.exp(-3*(dist/zone.radius)**2)*smooth(t);
    const movement=zoneMotion(zone,time,config,{impulseAge,waterAge,seed});
    dx+=weight*movement[0];dy+=weight*movement[1];
    total+=weight;
  }
  const norm=Math.max(1,total);
  return [x+clamp(dx/norm,-0.035,0.035)*rooted,y+clamp(dy/norm,-0.012,0.012)*rooted];
}
export function deformGrid(grid,time,config=DAISY,options={}) {
  const output=new Float32Array(grid.uv.length);
  for(let i=0;i<grid.uv.length;i+=2){
    const p=sampleMotion(grid.uv[i],grid.uv[i+1],time,config,options); output[i]=p[0];output[i+1]=p[1];
  }
  return output;
}
// Prepared coefficients keep the live renderer free of per-vertex exponentials.
export function prepareSkin(grid,config=DAISY){
 const weights=[];
 for(let i=0;i<grid.uv.length;i+=2){
  const x=grid.uv[i],y=grid.uv[i+1];
  if(isPinned(x,y,config)){weights.push(null);continue;}
  let rooted=config.pinY!==null?smooth((config.pinY-y)/(config.pinFeather??.14)):smooth((Math.hypot(x-config.root[0],y-config.root[1])-(config.rootRadius??.035))/(config.rootFeather??.16));
  for(const box of [config.pot,...(config.pins||[])].filter(Boolean)){const [l,t,r,b]=box;rooted*=smooth(Math.hypot(Math.max(l-x,0,x-r),Math.max(t-y,0,y-b))/(config.potFeather??.065));}
  const row=config.zones.map(z=>{const vx=z.tip[0]-z.base[0],vy=z.tip[1]-z.base[1],t=clamp(((x-z.base[0])*vx+(y-z.base[1])*vy)/(vx*vx+vy*vy),0,1);return Math.exp(-3*(Math.hypot(x-z.base[0]-t*vx,y-z.base[1]-t*vy)/z.radius)**2)*smooth(t);});
  weights.push({row,normalizer:Math.max(1,row.reduce((a,b)=>a+b,0)),rooted});
 }
 return {grid,config,weights,output:new Float32Array(grid.uv.length)};
}
export function evaluateSkin(skin,time,{reduced=false,impulseAge=Infinity,waterAge=Infinity,seed=0}={}){
 if(!Number.isFinite(time)||!Number.isFinite(seed))throw new TypeError('finite motion time required');
 const {grid,config,weights,output}=skin;
 if(reduced){output.set(grid.uv);return output;}
 const zones=config.zones.map(z=>zoneMotion(z,time,config,{impulseAge,waterAge,seed}));
 for(let j=0;j<weights.length;j++){
  const i=j*2,w=weights[j];if(!w){output[i]=grid.uv[i];output[i+1]=grid.uv[i+1];continue;}
  let dx=0,dy=0;for(let k=0;k<zones.length;k++){dx+=w.row[k]*zones[k][0];dy+=w.row[k]*zones[k][1];}
  output[i]=grid.uv[i]+clamp(dx/w.normalizer,-.035,.035)*w.rooted;
  output[i+1]=grid.uv[i+1]+clamp(dy/w.normalizer,-.012,.012)*w.rooted;
 }
 return output;
}
export function createPresentationClock(){
  let elapsed=0,last=null,visible=true;
  return {
    setVisible(value){visible=!!value;last=null;},
    step(now){if(!Number.isFinite(now))throw new TypeError('finite clock');if(last!==null&&visible)elapsed+=clamp((now-last)/1000,0,0.05);last=now;return elapsed;},
    get elapsed(){return elapsed;}
  };
}
