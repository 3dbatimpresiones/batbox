import assert from 'node:assert/strict';
import { buildRollerMesh, meshToBinarySTL, patternHeight, sampleCustomTexture } from '../src/lib/roller/core.js';

const mesh=buildRollerMesh();
assert.equal(mesh.params.length,100); assert.equal(mesh.params.diameter,28); assert.equal(mesh.params.hole,8);
assert.ok(mesh.triangles>400000); assert.equal(mesh.triVerts.length%3,0); assert.ok(meshToBinarySTL(mesh).size>20_000_000);
for(const p of ['wood','waves','bricks','diamonds','dots','lines']) for(const q of [[0,.4],[.999999,.4]]) assert.ok(Number.isFinite(patternHeight(p,...q)));
for(const p of ['wood','waves','bricks','diamonds','dots','lines']) assert.ok(Math.abs(patternHeight(p,0,.37,5,4)-patternHeight(p,1,.37,5,4))<1e-9,`${p} debe cerrar sin costura`);
const edges=new Map(); for(let i=0;i<mesh.triVerts.length;i+=3)for(const [a,b] of [[mesh.triVerts[i],mesh.triVerts[i+1]],[mesh.triVerts[i+1],mesh.triVerts[i+2]],[mesh.triVerts[i+2],mesh.triVerts[i]]]){const k=a<b?`${a}|${b}`:`${b}|${a}`;edges.set(k,(edges.get(k)||0)+1)}
assert.equal([...edges.values()].filter(n=>n!==2).length,0,'cada arista debe pertenecer a dos triángulos');
const custom={width:2,height:2,data:new Float32Array([1,0,0,1])};
assert.ok(sampleCustomTexture(custom,.01,.01)>sampleCustomTexture(custom,.49,.01));
const customMesh=buildRollerMesh({pattern:'custom',customTexture:custom,repeatX:2,repeatY:2});
assert.equal(customMesh.triVerts.length,mesh.triVerts.length);
console.log(`Rodillo OK: ${mesh.triangles} triángulos, ${meshToBinarySTL(mesh).size} bytes, sólido cerrado.`);
