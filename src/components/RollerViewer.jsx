import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function geometry(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.vertProperties, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1)); g.computeVertexNormals(); return g;
}

export default function RollerViewer({ mesh, color = '#d69a5b' }) {
  const box = useRef(null), st = useRef(null);
  useEffect(() => {
    const el=box.current, renderer=new THREE.WebGLRenderer({antialias:true,alpha:true}); renderer.setPixelRatio(Math.min(2,devicePixelRatio||1)); el.appendChild(renderer.domElement);
    const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(35,1,.1,2000); camera.up.set(0,0,1);
    scene.add(new THREE.HemisphereLight(0xffffff,0x26335f,2)); const sun=new THREE.DirectionalLight(0xffffff,2.2); sun.position.set(-100,-140,190); scene.add(sun);
    const content=new THREE.Group(); scene.add(content); const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.12; controls.screenSpacePanning=true;
    // Igual que chops / OrcaSlicer: izquierda orbita; derecha o ruedita
    // presionada desplazan; girar la rueda hace zoom.
    controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE; controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN; controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
    // Solo cancelamos la acción nativa del navegador. No cortamos la
    // propagación: OrbitControls necesita recibir el botón central para PAN.
    const stopMiddle=(e)=>{if(e.button===1)e.preventDefault()}; const stopMenu=(e)=>e.preventDefault(); const stopWheel=(e)=>{e.preventDefault();e.stopPropagation()};
    // Hay que cancelar desde pointerdown/mousedown: auxclick ocurre demasiado
    // tarde y Chromium ya puede haber activado su autoscroll de página.
    renderer.domElement.addEventListener('pointerdown',stopMiddle,{capture:true,passive:false});
    renderer.domElement.addEventListener('mousedown',stopMiddle,{capture:true,passive:false});
    renderer.domElement.addEventListener('auxclick',stopMiddle,{passive:false}); renderer.domElement.addEventListener('contextmenu',stopMenu); renderer.domElement.addEventListener('wheel',stopWheel,{passive:false});
    const ro=new ResizeObserver(()=>{const w=el.clientWidth,h=el.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}}); ro.observe(el);
    let raf; const loop=()=>{raf=requestAnimationFrame(loop);controls.update();renderer.render(scene,camera)}; loop(); st.current={renderer,scene,camera,controls,content}; if(import.meta.env.DEV)window.__rollerViewer=st.current;
    return()=>{cancelAnimationFrame(raf);ro.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',stopMiddle,true);renderer.domElement.removeEventListener('mousedown',stopMiddle,true);renderer.domElement.removeEventListener('auxclick',stopMiddle);renderer.domElement.removeEventListener('contextmenu',stopMenu);renderer.domElement.removeEventListener('wheel',stopWheel);content.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});renderer.dispose();el.removeChild(renderer.domElement)};
  },[]);
  useEffect(()=>{const s=st.current;if(!s||!mesh)return;s.content.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});s.content.clear();
    const m=new THREE.Mesh(geometry(mesh),new THREE.MeshStandardMaterial({color,roughness:.62,metalness:.02}));s.content.add(m);
    const L=mesh.params.length,D=mesh.params.diameter;
    // Solo encuadra la primera vez. Los cambios de textura, medida o calidad
    // reemplazan la malla sin tocar la cámara elegida por el usuario.
    if(!s.fitted){s.controls.target.set(0,0,L/2);s.camera.position.set(D*2.2,-Math.max(L*2.05,D*5.2),L*.68);s.controls.update();s.fitted=true}
    const grid=new THREE.GridHelper(Math.max(120,L*1.4),12,0x5ddadb,0x3a4774);grid.rotateX(Math.PI/2);s.scene.add(grid);return()=>s.scene.remove(grid);
  },[mesh,color]);
  return <div className="roller-viewer" ref={box}/>;
}
