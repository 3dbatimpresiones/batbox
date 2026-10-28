import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import AccessPanel from '../components/AccessPanel.jsx';
import FeedbackButton from '../components/FeedbackButton.jsx';
import Icon from '../components/Icon.jsx';
import RollerViewer from '../components/RollerViewer.jsx';
import { buildRollerMesh, meshToBinarySTL, ROLLER_DEFAULTS } from '../lib/roller/core.js';
import '../styles/rollers.css';
import '../styles/rollers-custom.css';
import '../styles/rollers-hd.css';
import '../styles/rollers-layout.css';
import '../styles/rollers-fit.css';

const PATTERNS=[['wood','Veta de madera'],['waves','Ondas'],['bricks','Ladrillos'],['diamonds','Rombos'],['dots','Puntos'],['lines','Líneas orgánicas']];
const Field=({label,value,onChange,min,max,step=1,unit})=><label className="roller-field"><span>{label}</span><div><input type="number" value={value} min={min} max={max} step={step} onChange={e=>onChange(Number(e.target.value))}/>{unit&&<b>{unit}</b>}</div></label>;

export default function Rollers(){
  const {isMember}=useAuth(); const [p,setP]=useState(ROLLER_DEFAULTS); const [color,setColor]=useState('#d69a5b'); const [textureName,setTextureName]=useState(''); const [texturePreview,setTexturePreview]=useState(''); const [textureError,setTextureError]=useState(''); const fileRef=useRef(null);
  useEffect(()=>{document.body.classList.add('roller-lock-scroll');return()=>document.body.classList.remove('roller-lock-scroll')},[]);
  const mesh=useMemo(()=>buildRollerMesh(p),[p]); const set=(k,v)=>setP(x=>({...x,[k]:v}));
  const loadTexture=async(file)=>{if(!file)return;setTextureError('');try{
    if(file.size>12*1024*1024)throw new Error('La imagen puede pesar hasta 12 MB.');
    const url=URL.createObjectURL(file), img=new Image();img.decoding='async';img.src=url;await img.decode();
    const max=512,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(2,Math.round(img.naturalWidth*scale)),h=Math.max(2,Math.round(img.naturalHeight*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);
    const rgba=x.getImageData(0,0,w,h).data,data=new Float32Array(w*h);for(let i=0;i<data.length;i++){const k=i*4,gray=(rgba[k]*.2126+rgba[k+1]*.7152+rgba[k+2]*.0722)/255;data[i]=(1-gray)*(rgba[k+3]/255)}
    setP(old=>({...old,pattern:'custom',customTexture:{data,width:w,height:h},repeatX:1,repeatY:1,invert:false,contrast:1.4,seamless:true}));setTextureName(file.name);setTexturePreview(c.toDataURL('image/png'));URL.revokeObjectURL(url);
  }catch(e){setTextureError(e.message||'No se pudo leer la textura.')}};
  const download=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(meshToBinarySTL(mesh));a.download=`rodillo-${p.pattern}-${p.length}x${p.diameter}mm.stl`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  if(!isMember)return <div className="club-locked"><div className="club-locked-head"><div className="section-label">MAKERS CLUB · HERRAMIENTA</div><h1>Creador de rodillos texturizadores</h1><p>Diseñá rodillos para cerámica, plastilina, arcilla polimérica y materiales similares.</p><FeedbackButton source="rodillos-texturizadores"/></div><AccessPanel intro="Herramienta privada para miembros del Makers Club"/></div>;
  return <div className="roller-page">
    <header className="roller-head"><div><div className="section-label">MODELADO · BATBOX</div><h1>Creador de rodillos texturizadores</h1><p>Generá un cilindro hueco listo para imprimir y envolverlo con una textura continua.</p></div><FeedbackButton source="rodillos-texturizadores"/></header>
    <div className="roller-layout"><aside className="roller-panel card">
      <h2>1 · Medidas del rodillo</h2><div className="roller-grid"><Field label="Largo" value={p.length} min={20} max={250} unit="mm" onChange={v=>set('length',v)}/><Field label="Diámetro exterior" value={p.diameter} min={12} max={100} unit="mm" onChange={v=>set('diameter',v)}/><Field label="Diámetro del hueco" value={p.hole} min={2} max={p.diameter-3} unit="mm" onChange={v=>set('hole',v)}/><Field label="Profundidad" value={p.depth} min={.2} max={4} step={.1} unit="mm" onChange={v=>set('depth',v)}/></div>
      <div className="roller-note"><Icon name="info" size={17}/><span>Base inicial: <b>100 × 28 mm</b>. El hueco arranca en 8 mm y se puede adaptar al eje o mango que uses.</span></div>
      <h2>2 · Textura</h2><input ref={fileRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>loadTexture(e.target.files?.[0])}/>
      <button className={'roller-upload '+(p.pattern==='custom'?'active':'')} onClick={()=>fileRef.current?.click()}><Icon name="upload" size={19}/><span><b>Importar textura personalizada</b><small>PNG, JPG, WebP o SVG · negro = textura</small></span></button>
      {textureError&&<div className="roller-error">{textureError}</div>}
      {texturePreview&&<div className="roller-custom"><img src={texturePreview} alt="Vista previa de la textura"/><div><b>{textureName}</b><small>{p.customTexture?.width} × {p.customTexture?.height} px procesados</small></div></div>}
      {p.pattern==='custom'&&<div className="roller-custom-options"><label><input type="checkbox" checked={!!p.invert} onChange={e=>set('invert',e.target.checked)}/> Invertir blanco y negro</label><label><input type="checkbox" checked={p.seamless!==false} onChange={e=>set('seamless',e.target.checked)}/> Unir los bordes sin costura</label><Field label="Contraste" value={p.contrast||1.4} min={.2} max={4} step={.1} onChange={v=>set('contrast',v)}/></div>}
      <div className="roller-patterns">{PATTERNS.map(([id,label])=><button key={id} className={p.pattern===id?'active':''} onClick={()=>set('pattern',id)}>{label}</button>)}</div>
      <div className="roller-grid"><Field label="Repeticiones alrededor" value={p.repeatX} min={1} max={20} onChange={v=>set('repeatX',v)}/><Field label="Repeticiones a lo largo" value={p.repeatY} min={1} max={20} onChange={v=>set('repeatY',v)}/></div>
      <div className="roller-quality"><span>Calidad de la malla</span><div><button className={p.resolution===192?'active':''} onClick={()=>set('resolution',192)}>Normal</button><button className={p.resolution===320?'active':''} onClick={()=>set('resolution',320)}>HD</button><button className={p.resolution===480?'active':''} onClick={()=>set('resolution',480)}>Ultra</button></div><small>HD recomendado. Ultra conserva líneas muy finas, pero genera un STL más pesado.</small></div>
      <div className="roller-mode"><button className={p.mode==='relief'?'active':''} onClick={()=>set('mode','relief')}>↑ Relieve</button><button className={p.mode==='engrave'?'active':''} onClick={()=>set('mode','engrave')}>↓ Grabado</button></div>
      <label className="roller-color"><span>Color de vista previa</span><input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>
      <div className="roller-actions"><button className="btn primary roller-download" onClick={download}><Icon name="download" size={18}/> Descargar STL</button><button className="btn ghost" onClick={()=>setP(ROLLER_DEFAULTS)}>Restablecer</button></div>
    </aside><main className="roller-stage card"><div className="roller-badge">{p.length} × {p.diameter} mm · hueco Ø {p.hole} mm</div><RollerViewer mesh={mesh} color={color}/><div className="roller-stats"><b>{p.resolution===480?'ULTRA':p.resolution===320?'HD':'NORMAL'}</b> · {mesh.params.radial} × {mesh.params.rows} segmentos · {mesh.triangles.toLocaleString('es-AR')} triángulos · sólido cerrado</div></main></div>
  </div>;
}
