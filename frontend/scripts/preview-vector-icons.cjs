const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'assets', 'vector-drawings', 'preview');
fs.mkdirSync(out, { recursive: true });
const icons = [
  ['Create tenancy','create-tenancy-line','#3F6ED8'],
  ['Exit requests','exit-request-blue-line','#3F6ED8'],
  ['Tenancy history','tenancy-history-line','#3F6ED8'],
  ['Upcoming exits','upcoming-exits-line','#3F6ED8'],
  ['Active','tenancy-active-line','#000000'],
  ['On notice','tenancy-on-notice-line','#000000'],
  ['Started','tenancy-started-line','#000000'],
  ['Ended','tenancy-ended-line','#000000'],
  ['Payments','digest-payments-line','#000000'],
  ['Concerns','digest-concerns-line','#000000'],
  ['Move-ins','digest-move-ins-line','#000000'],
  ['Move-outs','digest-move-outs-line','#000000'],
];
// Trace opaque-region boundaries, including holes. No raster is embedded in SVG.
function trace(png) {
  const { width:w, height:h, data } = png;
  const ink = (x,y) => x>=0 && y>=0 && x<w && y<h && data[(y*w+x)*4+3]>=128;
  const edges = new Map();
  const key = (x,y) => y*(w+1)+x;
  function add(x,y,xx,yy) { const k=key(x,y); if(!edges.has(k))edges.set(k,[]); edges.get(k).push(key(xx,yy)); }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(ink(x,y)){
    if(!ink(x,y-1))add(x,y,x+1,y);
    if(!ink(x+1,y))add(x+1,y,x+1,y+1);
    if(!ink(x,y+1))add(x+1,y+1,x,y+1);
    if(!ink(x-1,y))add(x,y+1,x,y);
  }
  const paths=[];
  while(edges.size){
    const start=edges.keys().next().value; let cur=start; const points=[];
    do {
      points.push([cur%(w+1),Math.floor(cur/(w+1))]);
      const next=edges.get(cur); if(!next)break;
      const dest=next.pop(); if(!next.length)edges.delete(cur); cur=dest;
    }while(cur!==start);
    if(points.length<4)continue;
    const clean=points.filter((p,i)=>{
      const a=points[(i+points.length-1)%points.length], b=points[(i+1)%points.length];
      return (p[0]-a[0])*(b[1]-p[1]) !== (p[1]-a[1])*(b[0]-p[0]);
    });
    paths.push('M'+clean.map(p=>p.join(' ')).join('L')+'Z');
  }
  return paths.join('');
}
const cards=[];
const sheet=[];
icons.forEach(([label,name,color],i)=>{
  const source=fs.readFileSync(path.join(root,'assets','vector-drawings','raster',name+'.png'));
  const png=PNG.sync.read(source);
  const d=trace(png);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${png.width} ${png.height}"><path fill="${color}" fill-rule="evenodd" d="${d}"/></svg>`;
  fs.writeFileSync(path.join(out,name+'.svg'),svg);
  cards.push(`<article><h2>${label}</h2><div class="pair"><figure><img src="data:image/png;base64,${source.toString('base64')}"><figcaption>Original PNG</figcaption></figure><figure><img src="${name}.svg"><figcaption>Traced SVG</figcaption></figure></div><a href="${name}.svg" download>Download SVG</a></article>`);
  const x=(i%4)*240,y=Math.floor(i/4)*230;
  sheet.push(`<g transform="translate(${x},${y})"><text x="120" y="28" text-anchor="middle" font-family="Arial" font-size="17" fill="#101827">${label}</text><svg x="44" y="45" width="152" height="152" viewBox="0 0 ${png.width} ${png.height}"><path fill="${color}" fill-rule="evenodd" d="${d}"/></svg></g>`);
});
fs.writeFileSync(path.join(out,'preview.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="690" viewBox="0 0 960 690"><rect width="960" height="690" fill="white"/>${sheet.join('')}</svg>`);
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>Vector icon previews</title><style>body{font-family:system-ui;background:#f5f7fa;color:#101827;padding:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:white;padding:16px;border:1px solid #ddd;border-radius:16px}h2{font-size:18px}.pair{display:flex;justify-content:center}figure{margin:8px;text-align:center}img{width:110px;height:110px}figcaption{font-size:12px;color:#667}a{font-size:13px}</style><h1>PNG → SVG comparison</h1><p>Preview only. Existing app icons are unchanged. Silhouette traces preserve the PNG shapes; these are filled vector paths, not editable centreline strokes.</p><main>${cards.join('')}</main>`);
console.log(out);
for(const [,name] of icons)console.log(name,fs.statSync(path.join(out,name+'.svg')).size+' bytes');
