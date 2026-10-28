// Smoke test del visor real. Requiere un Chromium con CDP en el puerto indicado y Vite en 5173.
const port = Number(process.argv[2] || 9222);
const targetUrl = 'http://127.0.0.1:5173/batbox/?simular=member#/separador';
const tab = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl); let seq = 0; const pending = new Map();
ws.onmessage = ({ data }) => { const m = JSON.parse(data), p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
await call('Runtime.enable'); await new Promise((r) => setTimeout(r, 1500));
const expression = `(async()=>{
  const wait=async(fn,ms=15000)=>{const end=Date.now()+ms;while(Date.now()<end){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,100));}throw new Error('timeout')};
  const input=await wait(()=>document.querySelector('input[type=file]'));
  const stl='solid tetra\\nfacet normal 0 0 -1\\nouter loop\\nvertex 0 0 0\\nvertex 0 10 0\\nvertex 10 0 0\\nendloop\\nendfacet\\nfacet normal 0 -1 0\\nouter loop\\nvertex 0 0 0\\nvertex 10 0 0\\nvertex 0 0 10\\nendloop\\nendfacet\\nfacet normal 1 1 1\\nouter loop\\nvertex 10 0 0\\nvertex 0 10 0\\nvertex 0 0 10\\nendloop\\nendfacet\\nfacet normal -1 0 0\\nouter loop\\nvertex 0 10 0\\nvertex 0 0 0\\nvertex 0 0 10\\nendloop\\nendfacet\\nendsolid tetra';
  const dt=new DataTransfer();dt.items.add(new File([stl],'smoke.stl',{type:'model/stl'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>document.querySelector('.split-file')&&!document.querySelector('.split-busy'),20000);await new Promise(r=>setTimeout(r,500));
  const canvas=document.querySelector('.split-viewer canvas'),s=window.__splitViewer,initial={canvas:!!canvas,width:canvas?.width||0,height:canvas?.height||0,meshes:s?.group?.children?.length||0,triangles:s?.renderer?.info?.render?.triangles||0,camera:s?.active?.position?.toArray?.()||null};
  [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Cortar la pieza seleccionada'))?.click();
  await wait(()=>document.querySelectorAll('.split-part').length===2&&!document.querySelector('.split-busy'),20000);
  return {...initial,pieces:document.querySelectorAll('.split-part').length};
})()`;
const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); const value = result.result.value;
await call('Page.close'); ws.close();
if (!value?.canvas || value.width < 10 || value.height < 10 || value.meshes !== 1 || value.triangles < 4 || Math.hypot(...value.camera) < 1 || value.pieces !== 2) throw new Error(`Smoke BATSplit falló: ${JSON.stringify(value)}`);
console.log(`BATSplit browser smoke OK: ${JSON.stringify(value)}`);
