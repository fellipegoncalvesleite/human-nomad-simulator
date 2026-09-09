import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";
import { clonePhysicalConstants } from "./lib/worldM0M02Fixture.mjs";

const ROOT = process.cwd();
const BASINS_PATH = `${ROOT}/src/sim/world/physical/terrainBasins.ts`;
const VALLEYS_PATH = `${ROOT}/src/sim/world/physical/terrainValleys.ts`;
const CELL = 250;
const AREA = 62_500;

async function loadModules(suffix = "") {
  const server = await createServer({ root: `${ROOT}/src`, configFile: false, appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error" });
  const loaded = {};
  try {
    loaded.scratch = await server.ssrLoadModule("/sim/world/physical/terrainScratch.ts");
    if (existsSync(BASINS_PATH)) loaded.basins = await server.ssrLoadModule(`/sim/world/physical/terrainBasins.ts${suffix}`);
    if (existsSync(VALLEYS_PATH)) loaded.valleys = await server.ssrLoadModule(`/sim/world/physical/terrainValleys.ts${suffix}`);
  } catch (error) { loaded.loadError = error instanceof Error ? error.message : String(error); }
  finally { await server.close(); }
  return loaded;
}
const modules = await loadModules();
const ok = (r) => r?.ok === true ? r.value : undefined;
const err = (r) => r?.ok === false ? r.error : undefined;
const point = (xM, yM) => ({ xM, yM });
const cellCenter = (cell, width = 5, height = 5) => {
  const row = Math.floor(cell / width), column = cell - row * width;
  return point((column + 0.5) * CELL, (height - row - 0.5) * CELL);
};
const id = (ns, n) => `${ns}:${n.toString(16).padStart(16, "0")}`;
const ring = (...xy) => xy.map(([xM,yM]) => point(xM,yM));
const F_RING = ring([500,500],[1000,500],[1000,750],[500,750],[500,500]);
function area2(points) { let a=0; for(let i=0;i+1<points.length;i++) a += points[i].xM*points[i+1].yM-points[i+1].xM*points[i].yM; return a; }
function pointInRing(p, points) {
  let inside=false;
  for(let i=0,j=points.length-2;i<points.length-1;j=i++) {
    const a=points[i],b=points[j];
    if((a.yM>p.yM)!==(b.yM>p.yM)) {
      const x=a.xM+((p.yM-a.yM)*(b.xM-a.xM))/(b.yM-a.yM);
      if(x>p.xM) inside=!inside;
    }
  }
  return inside;
}
function interiorProbe(points) {
  const a=area2(points), p=points[0], n=points[1], dx=n.xM-p.xM, dy=n.yM-p.yM, len=Math.hypot(dx,dy);
  if(!a||!len) return undefined;
  const side=Math.sign(a);
  return point((p.xM+n.xM)/2+side*(-dy/len),(p.yM+n.yM)/2+side*(dx/len));
}
function ringRoleAreaExact(rings, expectedAreaM2) {
  if(!Array.isArray(rings)||rings.length===0) return false;
  let signedPhysicalArea=0;
  for(let i=0;i<rings.length;i++) {
    const probe=interiorProbe(rings[i]);
    if(!probe) return false;
    let depth=0;
    for(let j=0;j<rings.length;j++) if(i!==j&&pointInRing(probe,rings[j])) depth++;
    const a=area2(rings[i]);
    if(((depth&1)===0&&a<=0)||((depth&1)===1&&a>=0)) return false;
    signedPhysicalArea += a/2;
  }
  return signedPhysicalArea===expectedAreaM2;
}
function exactKeys(value, keys) { return value && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()); }
function bytes(v) { return Buffer.from(JSON.stringify(v) ?? "undefined", "utf8"); }
function sameBytes(a,b) { return bytes(a).equals(bytes(b)); }
function safeCall(fn) {
  try { return fn(); } catch (error) { return { thrown: error instanceof Error ? error.message : String(error) }; }
}
function coastlineFor(grid, coastline = []) {
  const landCells = grid ? [...grid.landMask].filter((value)=>value===1).length : 0;
  const cellAreaM2 = grid?.cellAreaM2 ?? AREA;
  return { seaLevelMeters:0, coastline, landAreaM2:landCells*cellAreaM2, oceanAreaM2:((grid?.landMask.length??0)-landCells)*cellAreaM2 };
}

function makeGrid(width, height, elevations, landMask = Array(width*height).fill(1), constants = clonePhysicalConstants()) {
  const budget = ok(modules.scratch?.createTerrainScratchBudget?.(constants.analysis.maxScratchBytes));
  const grid = budget && ok(modules.scratch?.allocateTerrainScratchGrid?.(width*CELL,height*CELL,constants,budget));
  if (grid) { grid.elevationMeters.set(elevations); grid.landMask.set(landMask); }
  return { constants, budget, grid };
}
function releaseGrid(grid) {
  if (!grid) return false;
  return ["elevationMeters","landMask","routingElevationMeters","flatRank","terminalKindByCell","terminalOrdinalByCell"]
    .every((label) => grid.budget.release(label)?.ok === true);
}
function drainageFor(kind, terminalPoint = point(625,625)) {
  const terminalId=id("terminal",0), catchmentId=id("catchment",0);
  return {
    terminals:[{id:terminalId,kind,point:terminalPoint,catchmentId}],
    catchments:[{id:catchmentId,terminalId,areaM2:125000,boundaryRings:[F_RING]}],
    nodes:[], reaches:[],
    retainedDepressionLinks:[{depressionToken:"depression-analysis:0000000000000000",catchmentId,terminalId}],
  };
}
const retainedBase = {
  token:"depression-analysis:0000000000000000", canonicalFloorCell:12, floorElevationMeters:1,
  physicalSpillElevationMeters:4, areaM2:125000, boundaryRings:[F_RING],
};
const f5Grid = makeGrid(5,5,Array(25).fill(9));
const f5 = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f5Grid.grid,
  {retainedDepressions:[],terminalOwners:{terminalKindByCell:f5Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f5Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f5Grid.grid), {terminals:[],catchments:[],nodes:[],reaches:[],retainedDepressionLinks:[]},f5Grid.constants));

const f6Elevations=Array(25).fill(9); f6Elevations[12]=1;
const f6Grid = makeGrid(5,5,f6Elevations);
if (f6Grid.grid) f6Grid.grid.routingElevationMeters[12]=4;
const f6Dep = {...retainedBase,persistentSpillElevationMeters:null,protectedIntentToken:"protected-basin:0000000000000000",closedEndorheic:true};
const f6 = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f6Grid.grid,
  {retainedDepressions:[f6Dep],terminalOwners:{terminalKindByCell:f6Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f6Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f6Grid.grid), drainageFor("retained_closed_basin"),f6Grid.constants));
const f6Bad = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f6Grid.grid,
  {retainedDepressions:[{...f6Dep,persistentSpillElevationMeters:4}],terminalOwners:{terminalKindByCell:f6Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f6Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f6Grid.grid), drainageFor("retained_closed_basin"),f6Grid.constants));

const f7Elevations=Array(25).fill(9); f7Elevations[12]=1;
const f7Grid = makeGrid(5,5,f7Elevations);
const f7Dep = {...retainedBase,persistentSpillElevationMeters:4,protectedIntentToken:null,closedEndorheic:false};
const f7Drain = drainageFor("external_domain_outlet",point(1250,125));
const f7 = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f7Grid.grid,
  {retainedDepressions:[f7Dep],terminalOwners:{terminalKindByCell:f7Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f7Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},coastlineFor(f7Grid.grid),f7Drain,f7Grid.constants));
const f7Ocean = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f7Grid.grid,
  {retainedDepressions:[f7Dep],terminalOwners:{terminalKindByCell:f7Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f7Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f7Grid.grid),drainageFor("ocean_outlet",point(625,125)),f7Grid.constants));
const f7ProtectedBad = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f7Grid.grid,
  {retainedDepressions:[{...f7Dep,protectedIntentToken:"protected-basin:0000000000000001"}],terminalOwners:{terminalKindByCell:f7Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f7Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f7Grid.grid),f7Drain,f7Grid.constants));
const f7NullSpillBad = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f7Grid.grid,
  {retainedDepressions:[{...f7Dep,persistentSpillElevationMeters:null}],terminalOwners:{terminalKindByCell:f7Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f7Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f7Grid.grid),f7Drain,f7Grid.constants));
const f7MismatchSpillBad = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f7Grid.grid,
  {retainedDepressions:[{...f7Dep,persistentSpillElevationMeters:5}],terminalOwners:{terminalKindByCell:f7Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f7Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f7Grid.grid),f7Drain,f7Grid.constants));
const f6OceanBad = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f6Grid.grid,
  {retainedDepressions:[f6Dep],terminalOwners:{terminalKindByCell:f6Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f6Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f6Grid.grid),drainageFor("ocean_outlet",point(625,125)),f6Grid.constants));
const f6ExternalBad = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f6Grid.grid,
  {retainedDepressions:[f6Dep],terminalOwners:{terminalKindByCell:f6Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f6Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f6Grid.grid),drainageFor("external_domain_outlet",point(1250,125)),f6Grid.constants));
const f7MissingCatchmentDrain={...f7Drain,retainedDepressionLinks:[{...f7Drain.retainedDepressionLinks[0],catchmentId:id("catchment",9)}]};
const f7MissingCatchmentBad=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f7Grid.grid,
  {retainedDepressions:[f7Dep],terminalOwners:{terminalKindByCell:f7Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f7Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f7Grid.grid),f7MissingCatchmentDrain,f7Grid.constants));
const f7NonreciprocalDrain={...f7Drain,catchments:[{...f7Drain.catchments[0],terminalId:id("terminal",9)}]};
const f7NonreciprocalBad=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(f7Grid.grid,
  {retainedDepressions:[f7Dep],terminalOwners:{terminalKindByCell:f7Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f7Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f7Grid.grid),f7NonreciprocalDrain,f7Grid.constants));

const twoElevations=Array(25).fill(9); twoElevations[12]=1; twoElevations[20]=2; twoElevations[16]=1;
const twoGrid = makeGrid(5,5,twoElevations);
const ringB = ring([0,0],[250,0],[250,250],[0,250],[0,0]);
const ringC = ring([1000,0],[1250,0],[1250,250],[1000,250],[1000,0]);
const depB = {token:"depression-analysis:0000000000000001",canonicalFloorCell:20,floorElevationMeters:2,
  physicalSpillElevationMeters:5,persistentSpillElevationMeters:5,protectedIntentToken:null,closedEndorheic:false,areaM2:125000,boundaryRings:[ringB,ringC]};
const term0={id:id("terminal",0),kind:"retained_closed_basin",point:point(625,625),catchmentId:id("catchment",0)};
const term1={id:id("terminal",1),kind:"external_domain_outlet",point:point(0,125),catchmentId:id("catchment",1)};
const twoDrain={terminals:[term0,term1],catchments:[
  {id:id("catchment",0),terminalId:term0.id,areaM2:125000,boundaryRings:[F_RING]},
  {id:id("catchment",1),terminalId:term1.id,areaM2:125000,boundaryRings:[ringB,ringC]}],nodes:[],reaches:[],retainedDepressionLinks:[
  {depressionToken:f6Dep.token,catchmentId:id("catchment",0),terminalId:term0.id},
  {depressionToken:depB.token,catchmentId:id("catchment",1),terminalId:term1.id}]};
const depAnalysis=(items)=>({retainedDepressions:items,terminalOwners:{terminalKindByCell:twoGrid.grid?.terminalKindByCell,terminalOrdinalByCell:twoGrid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:2,repairOperationCount:0});
// Task-8 derives both links from catchmentRoot[canonicalFloorCell]. The upstream
// exorheic depression therefore legitimately resolves to the SAME catchment and
// retained-closed terminal as the different downstream protected depression.
const downstreamClosedCatchment={...twoDrain.catchments[0],areaM2:1_562_500,boundaryRings:[ring([0,0],[1250,0],[1250,1250],[0,1250],[0,0])]};
const downstreamClosedDrain={terminals:[term0],catchments:[downstreamClosedCatchment],nodes:[],reaches:[],retainedDepressionLinks:[
  {depressionToken:f6Dep.token,catchmentId:term0.catchmentId,terminalId:term0.id},
  {depressionToken:depB.token,catchmentId:term0.catchmentId,terminalId:term0.id}]};
const exorheicDownstreamClosed=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(
  twoGrid.grid,depAnalysis([depB,f6Dep]),coastlineFor(twoGrid.grid),downstreamClosedDrain,twoGrid.constants));
const d3Forward=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(twoGrid.grid,depAnalysis([f6Dep,depB]),coastlineFor(twoGrid.grid),twoDrain,twoGrid.constants));
const d3Reverse=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(twoGrid.grid,depAnalysis([{...depB,boundaryRings:[...depB.boundaryRings].reverse()},f6Dep]),coastlineFor(twoGrid.grid),{...twoDrain,retainedDepressionLinks:[...twoDrain.retainedDepressionLinks].reverse()},twoGrid.constants));

function pairFixture(firstCell, secondCell, firstElevation, secondElevation, reversePhysicalIds = false) {
  const elevations=Array(25).fill(20); elevations[firstCell]=firstElevation; elevations[secondCell]=secondElevation;
  const fixtureGrid=makeGrid(5,5,elevations);
  const firstPoint=cellCenter(firstCell),secondPoint=cellCenter(secondCell);
  const cellBoundary=(center)=>ring(
    [center.xM-125,center.yM-125],[center.xM+125,center.yM-125],
    [center.xM+125,center.yM+125],[center.xM-125,center.yM+125],[center.xM-125,center.yM-125]);
  const firstOrdinal=reversePhysicalIds?11:10,secondOrdinal=reversePhysicalIds?10:11;
  const firstTerminal={id:id("terminal",firstOrdinal),kind:"external_domain_outlet",point:point(0,firstPoint.yM),catchmentId:id("catchment",firstOrdinal)};
  const secondTerminal={id:id("terminal",secondOrdinal),kind:"external_domain_outlet",point:point(1250,secondPoint.yM),catchmentId:id("catchment",secondOrdinal)};
  const firstCatchment={id:firstTerminal.catchmentId,terminalId:firstTerminal.id,areaM2:AREA,boundaryRings:[cellBoundary(firstPoint)]};
  const secondCatchment={id:secondTerminal.catchmentId,terminalId:secondTerminal.id,areaM2:AREA,boundaryRings:[cellBoundary(secondPoint)]};
  const firstDep={token:"depression-analysis:000000000000000a",canonicalFloorCell:firstCell,floorElevationMeters:firstElevation,
    physicalSpillElevationMeters:firstElevation+10,persistentSpillElevationMeters:firstElevation+10,protectedIntentToken:null,closedEndorheic:false,
    areaM2:AREA,boundaryRings:firstCatchment.boundaryRings};
  const secondDep={token:"depression-analysis:000000000000000b",canonicalFloorCell:secondCell,floorElevationMeters:secondElevation,
    physicalSpillElevationMeters:secondElevation+10,persistentSpillElevationMeters:secondElevation+10,protectedIntentToken:null,closedEndorheic:false,
    areaM2:AREA,boundaryRings:secondCatchment.boundaryRings};
  const drainage={terminals:[secondTerminal,firstTerminal],catchments:[secondCatchment,firstCatchment],nodes:[],reaches:[],retainedDepressionLinks:[
    {depressionToken:secondDep.token,catchmentId:secondCatchment.id,terminalId:secondTerminal.id},
    {depressionToken:firstDep.token,catchmentId:firstCatchment.id,terminalId:firstTerminal.id},
  ]};
  const analysis={retainedDepressions:[secondDep,firstDep],terminalOwners:{terminalKindByCell:fixtureGrid.grid?.terminalKindByCell,terminalOrdinalByCell:fixtureGrid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:2,repairOperationCount:0};
  const result=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(fixtureGrid.grid,analysis,coastlineFor(fixtureGrid.grid),drainage,fixtureGrid.constants));
  return {fixtureGrid,firstPoint,secondPoint,firstDep,secondDep,drainage,analysis,result};
}

// Literal v3 ordering REDs. Elevation deliberately opposes the coordinate order.
const xBeforeElevation=pairFixture(20,22,7,1); // (125,125) must precede (625,125)
const yBeforeElevation=pairFixture(20,10,7,1); // (125,125) must precede (125,625)
const xBeforeYAxisPriority=pairFixture(10,21,7,7); // (125,625) must precede (375,125)
const pointBeforePhysicalId=pairFixture(20,22,7,7,true); // smaller point deliberately owns the larger catchment/terminal id

const hiddenOldPersistedFields={catchmentId:id("catchment",0),floorElevationMeters:7,spillElevationMeters:10,
  outletTerminalId:id("terminal",0),closedEndorheic:false,areaM2:AREA,boundaryRings:[ring([0,0],[250,0],[250,250],[0,250],[0,0])]};
const hiddenFloorV2CannotDistinguish=sameBytes(hiddenOldPersistedFields,{...hiddenOldPersistedFields}) &&
  !sameBytes({...hiddenOldPersistedFields,floorPoint:point(125,125)},{...hiddenOldPersistedFields,floorPoint:point(625,125)});

// Final-key collision RED: physical spill distinguishes the domain-3 pre-key, while
// both closed basins persist null spill and otherwise have the same complete final key.
const duplicateFinalDep={...f6Dep,token:"depression-analysis:0000000000000001",physicalSpillElevationMeters:5};
const duplicateFinalDrain={...drainageFor("retained_closed_basin"),retainedDepressionLinks:[
  {depressionToken:f6Dep.token,catchmentId:id("catchment",0),terminalId:id("terminal",0)},
  {depressionToken:duplicateFinalDep.token,catchmentId:id("catchment",0),terminalId:id("terminal",0)},
]};
const duplicateFinalAnalysis={retainedDepressions:[duplicateFinalDep,f6Dep],terminalOwners:{terminalKindByCell:f6Grid.grid?.terminalKindByCell,
  terminalOrdinalByCell:f6Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:2,repairOperationCount:0};
const duplicateFinalKeyResult=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(
  f6Grid.grid,duplicateFinalAnalysis,coastlineFor(f6Grid.grid),duplicateFinalDrain,f6Grid.constants));

const outsideBasinRing=ring([0,0],[500,0],[500,250],[0,250],[0,0]);
const floorOutsideBasinResult=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(
  f6Grid.grid,{...duplicateFinalAnalysis,retainedDepressions:[{...f6Dep,boundaryRings:[outsideBasinRing],areaM2:125000}],conditionedDepressionCount:1},
  coastlineFor(f6Grid.grid),drainageFor("retained_closed_basin"),f6Grid.constants));
const outerHoleRing=ring([250,250],[1000,250],[1000,1000],[250,1000],[250,250]);
const excludedHoleRing=ring([500,500],[500,750],[750,750],[750,500],[500,500]);
const floorInsideHoleResult=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(
  f6Grid.grid,{...duplicateFinalAnalysis,retainedDepressions:[{...f6Dep,boundaryRings:[outerHoleRing,excludedHoleRing],areaM2:500000}],conditionedDepressionCount:1},
  coastlineFor(f6Grid.grid),drainageFor("retained_closed_basin"),f6Grid.constants));
const outsideCatchmentDrain=drainageFor("retained_closed_basin");
outsideCatchmentDrain.catchments[0]={...outsideCatchmentDrain.catchments[0],boundaryRings:[outsideBasinRing]};
const floorOutsideCatchmentResult=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(
  f6Grid.grid,{...duplicateFinalAnalysis,retainedDepressions:[f6Dep],conditionedDepressionCount:1},coastlineFor(f6Grid.grid),outsideCatchmentDrain,f6Grid.constants));
const closedTerminalMismatchResult=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(
  f6Grid.grid,{...duplicateFinalAnalysis,retainedDepressions:[f6Dep],conditionedDepressionCount:1},coastlineFor(f6Grid.grid),
  drainageFor("retained_closed_basin",point(875,625)),f6Grid.constants));
const conditionedElevationSubstitutionResult=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(
  f6Grid.grid,{...duplicateFinalAnalysis,retainedDepressions:[{...f6Dep,floorElevationMeters:4}],conditionedDepressionCount:1},
  coastlineFor(f6Grid.grid),drainageFor("retained_closed_basin"),f6Grid.constants));

const vc=clonePhysicalConstants(); vc.geometry.valleySearchRadiusMeters=500; vc.geometry.valleyRelativeReliefMeters=30; vc.geometry.floodplainCandidateMaxSlope=0.03;
const w=7,h=7; const elevations=[];
for(let r=0;r<h;r++) for(let c=0;c<w;c++) {
  const corridor=Math.abs(r-3)<=1;
  elevations.push(corridor ? 20 + Math.abs(r-3)*2 + (6-c)*0.5 : 90);
}
elevations[0]=20;
const valleyGrid=makeGrid(w,h,elevations,Array(w*h).fill(1),vc);
const reachA={id:id("drainage-reach",0),upstreamNodeId:id("drainage-node",0),downstreamNodeId:id("drainage-node",1),downstreamReachId:null,
  catchmentId:id("catchment",0),terminalId:id("terminal",0),geometry:[point(375,875),point(875,875),point(1375,875)],lengthMeters:1000,
  contributingAreaM2:500000,localContributingAreaM2:500000,meanTerrainGradient:0.01,localReliefMeters:70,channelIncisionMeters:20};
const reachB={...reachA,id:id("drainage-reach",1),upstreamNodeId:id("drainage-node",2),downstreamNodeId:id("drainage-node",3),
  catchmentId:id("catchment",1),terminalId:id("terminal",1),geometry:[point(375,375),point(875,375),point(1375,375)]};
const valleyTerminals=[
  {id:id("terminal",0),kind:"external_domain_outlet",point:reachA.geometry.at(-1),catchmentId:id("catchment",0)},
  {id:id("terminal",1),kind:"external_domain_outlet",point:reachB.geometry.at(-1),catchmentId:id("catchment",1)},
];
const valleyNodes=[
  {id:id("drainage-node",0),point:reachA.geometry[0],kind:"source",terminalId:null},
  {id:id("drainage-node",1),point:reachA.geometry.at(-1),kind:"terminal",terminalId:valleyTerminals[0].id},
  {id:id("drainage-node",2),point:reachB.geometry[0],kind:"source",terminalId:null},
  {id:id("drainage-node",3),point:reachB.geometry.at(-1),kind:"terminal",terminalId:valleyTerminals[1].id},
];
const valleyCatchments=[
  {id:id("catchment",0),terminalId:valleyTerminals[0].id,areaM2:25*AREA,boundaryRings:[ring([0,750],[1750,750],[1750,1750],[0,1750],[0,750])]},
  {id:id("catchment",1),terminalId:valleyTerminals[1].id,areaM2:24*AREA,boundaryRings:[ring([0,0],[1750,0],[1750,750],[0,750],[0,0])]},
];
const valleyDrainage={terminals:valleyTerminals,catchments:valleyCatchments,nodes:valleyNodes,reaches:[reachA,reachB],retainedDepressionLinks:[]};
const valleyDrainageReverse={...valleyDrainage,terminals:[...valleyTerminals].reverse(),catchments:[...valleyCatchments].reverse(),nodes:[...valleyNodes].reverse(),reaches:[reachB,reachA]};
const valleyBudgetBefore=valleyGrid.budget?.snapshot?.();
const valleysForward=safeCall(()=>modules.valleys?.deriveTerrainValleyGeometry?.(valleyGrid.grid,valleyDrainage,vc));
const valleysReverse=safeCall(()=>modules.valleys?.deriveTerrainValleyGeometry?.(valleyGrid.grid,valleyDrainageReverse,vc));
const valleyBudgetAfter=valleyGrid.budget?.snapshot?.();
const vv=ok(valleysForward); const vvRev=ok(valleysReverse);

const reachPhysicalIdWitness=vv?.valleys?.find((v)=>v.reachId===reachB.id)?.id===id("valley",0) &&
  vv?.floodplainCandidates?.find((v)=>v.reachId===reachB.id)?.id===id("floodplain",0);

// Exact Task-8 reach physical-key discriminator. Both reaches start at the same
// physical point, so the legacy geometry-only key falls through to downstream
// geometry and orders the confluence reach first. Frozen Task-8 authority orders
// the SOURCE upstream-node kind before CONFLUENCE, so the source reach must own
// Domain-4/5 ordinal zero even though its persistent reach ID is ordinal one.
const exactKeyStart=point(375,875), exactKeySourceEnd=point(1375,875), exactKeyConfluenceEnd=point(875,375);
const exactKeyTermSource={id:id("terminal",10),kind:"external_domain_outlet",point:exactKeySourceEnd,catchmentId:id("catchment",10)};
const exactKeyTermConfluence={id:id("terminal",11),kind:"external_domain_outlet",point:exactKeyConfluenceEnd,catchmentId:id("catchment",11)};
const exactKeyNodes=[
  {id:id("drainage-node",10),point:exactKeyStart,kind:"source",terminalId:null},
  {id:id("drainage-node",11),point:exactKeySourceEnd,kind:"terminal",terminalId:exactKeyTermSource.id},
  {id:id("drainage-node",12),point:exactKeyStart,kind:"confluence",terminalId:null},
  {id:id("drainage-node",13),point:exactKeyConfluenceEnd,kind:"terminal",terminalId:exactKeyTermConfluence.id},
];
const exactKeyCatchments=[
  {id:id("catchment",10),terminalId:exactKeyTermSource.id,areaM2:25*AREA,boundaryRings:[ring([0,750],[1750,750],[1750,1750],[0,1750],[0,750])]},
  {id:id("catchment",11),terminalId:exactKeyTermConfluence.id,areaM2:24*AREA,boundaryRings:[ring([0,0],[1750,0],[1750,750],[0,750],[0,0])]},
];
const exactKeySourceReach={...reachA,id:id("drainage-reach",1),upstreamNodeId:exactKeyNodes[0].id,downstreamNodeId:exactKeyNodes[1].id,
  catchmentId:exactKeyCatchments[0].id,terminalId:exactKeyTermSource.id,geometry:[exactKeyStart,exactKeySourceEnd],lengthMeters:1000};
const exactKeyConfluenceReach={...reachA,id:id("drainage-reach",0),upstreamNodeId:exactKeyNodes[2].id,downstreamNodeId:exactKeyNodes[3].id,
  catchmentId:exactKeyCatchments[1].id,terminalId:exactKeyTermConfluence.id,geometry:[exactKeyStart,exactKeyConfluenceEnd],lengthMeters:Math.hypot(500,500)};
const exactKeyDrainage={terminals:[exactKeyTermSource,exactKeyTermConfluence],catchments:exactKeyCatchments,nodes:exactKeyNodes,
  reaches:[exactKeyConfluenceReach,exactKeySourceReach],retainedDepressionLinks:[]};
const exactKeyResult=safeCall(()=>modules.valleys?.deriveTerrainValleyGeometry?.(valleyGrid.grid,exactKeyDrainage,vc));
const exactKeyValue=ok(exactKeyResult);
const exactTask8PhysicalKeyWitness=exactKeyValue?.valleys?.find((v)=>v.reachId===exactKeySourceReach.id)?.id===id("valley",0) &&
  exactKeyValue?.floodplainCandidates?.find((v)=>v.reachId===exactKeySourceReach.id)?.id===id("floodplain",0);

const rawCells=[8,16];
const rawForward=modules.valleys?.traceTask9CellUnionRingsV1?.(rawCells,valleyGrid.grid,"audit.rawRings");
const rawReverse=modules.valleys?.traceTask9CellUnionRingsV1?.([...rawCells].reverse(),valleyGrid.grid,"audit.rawRings");

const longConstants=clonePhysicalConstants(); longConstants.geometry.valleySearchRadiusMeters=250; longConstants.geometry.valleyRelativeReliefMeters=100; longConstants.geometry.floodplainCandidateMaxSlope=1;
const longGrid=makeGrid(50,50,Array(2500).fill(10),Array(2500).fill(1),longConstants);
const longTerminal={id:id("terminal",0),kind:"external_domain_outlet",point:point(12375,12375),catchmentId:id("catchment",0)};
const longNodes=[{id:id("drainage-node",0),point:point(125,125),kind:"source",terminalId:null},{id:id("drainage-node",1),point:longTerminal.point,kind:"terminal",terminalId:longTerminal.id}];
const longReach={...reachA,id:id("drainage-reach",0),upstreamNodeId:longNodes[0].id,downstreamNodeId:longNodes[1].id,catchmentId:id("catchment",0),terminalId:longTerminal.id,geometry:[longNodes[0].point,longNodes[1].point],lengthMeters:Math.hypot(12250,12250)};
const longDrainage={terminals:[longTerminal],catchments:[{id:id("catchment",0),terminalId:longTerminal.id,areaM2:2500*AREA,boundaryRings:[ring([0,0],[12500,0],[12500,12500],[0,12500],[0,0])]}],nodes:longNodes,reaches:[longReach],retainedDepressionLinks:[]};
const longCorridor=safeCall(()=>modules.valleys?.deriveTerrainValleyGeometry?.(longGrid.grid,longDrainage,longConstants));

const f6Value=ok(f6)?.[0]; const f7Value=ok(f7)?.[0];
const f7OceanValue=ok(f7Ocean)?.[0];
const exorheicDownstreamClosedValue=ok(exorheicDownstreamClosed);

// Correction RED discriminators. These call the frozen corrected interfaces directly;
// the pre-correction Task-9 commit must fail them for the named architectural reasons.
const correctionF6 = safeCall(()=>modules.basins?.finalizeDepressionBasins?.(
  f6Grid.grid,
  {retainedDepressions:[f6Dep],terminalOwners:{terminalKindByCell:f6Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f6Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
  coastlineFor(f6Grid.grid), drainageFor("retained_closed_basin"), f6Grid.constants));

const safeNonCollinearRing = ring([0,0],[250,0],[500,250],[750,250],[750,750],[0,750],[0,0]);
const nonCollinearBeforeVertices = safeNonCollinearRing.length;
const correctionNonCollinear = safeCall(()=>modules.basins?.simplifyTask9NormalizedRasterRingFeatureV1?.(
  [safeNonCollinearRing], f6Grid.grid, f6Grid.constants, "audit.nonCollinear", { preserveRasterClassification:false }));
const nonCollinearAfter = ok(correctionNonCollinear);


const blockingReference=[point(250,50),point(250,150)];
const safeFinalReference=[point(500,375),point(500,625)];
const referenceProtected=safeCall(()=>modules.basins?.simplifyTask9NormalizedRasterRingFeatureV1?.(
  [safeNonCollinearRing],f6Grid.grid,f6Grid.constants,"audit.referenceProtected",
  {preserveRasterClassification:false,references:[{originalGeometry:blockingReference,currentGeometry:blockingReference}]}));
const earlierFinalReference=safeCall(()=>modules.basins?.simplifyTask9NormalizedRasterRingFeatureV1?.(
  [safeNonCollinearRing],f6Grid.grid,f6Grid.constants,"audit.earlierFinal",
  {preserveRasterClassification:false,references:[{originalGeometry:blockingReference,currentGeometry:safeFinalReference}]}));
const referenceProtectedValue=ok(referenceProtected),earlierFinalValue=ok(earlierFinalReference);
const referenceProtectionWitness=Array.isArray(referenceProtectedValue)&&Array.isArray(nonCollinearAfter)&&
  referenceProtectedValue[0]?.length>nonCollinearAfter[0]?.length;
const earlierFinalLaterOriginalWitness=Array.isArray(earlierFinalValue)&&Array.isArray(referenceProtectedValue)&&
  earlierFinalValue[0]?.length<referenceProtectedValue[0]?.length;

// End-to-end Domain-3 coastline witness. The blocking final coastline trace
// crosses a legal simplification chord but is disjoint from the ORIGINAL ring,
// so finalizeDepressionBasins must retain the two otherwise-deletable vertices.
const coastDep={token:"depression-analysis:0000000000000003",canonicalFloorCell:16,floorElevationMeters:1,
  physicalSpillElevationMeters:4,persistentSpillElevationMeters:4,protectedIntentToken:null,closedEndorheic:false,areaM2:468750,boundaryRings:[safeNonCollinearRing]};
const coastTerm={id:id("terminal",3),kind:"external_domain_outlet",point:point(875,1125),catchmentId:id("catchment",3)};
const coastCatch={id:id("catchment",3),terminalId:coastTerm.id,areaM2:22_500,boundaryRings:[ring([300,300],[450,300],[450,450],[300,450],[300,300])]};
const coastDrain={terminals:[coastTerm],catchments:[coastCatch],nodes:[],reaches:[],retainedDepressionLinks:[
  {depressionToken:coastDep.token,catchmentId:coastCatch.id,terminalId:coastTerm.id}]};
const coastAnalysis={retainedDepressions:[coastDep],terminalOwners:{terminalKindByCell:twoGrid.grid?.terminalKindByCell,terminalOrdinalByCell:twoGrid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0};
const coastUnblocked=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(twoGrid.grid,coastAnalysis,coastlineFor(twoGrid.grid),coastDrain,twoGrid.constants));
const coastBlocked=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(twoGrid.grid,coastAnalysis,coastlineFor(twoGrid.grid,[blockingReference]),coastDrain,twoGrid.constants));
const coastUnblockedValue=ok(coastUnblocked)?.[0],coastBlockedValue=ok(coastBlocked)?.[0];
const domain3FinalCoastlineWitness=Boolean(coastUnblockedValue&&coastBlockedValue&&
  coastUnblockedValue.boundaryRings[0].length<coastBlockedValue.boundaryRings[0].length&&
  coastBlockedValue.boundaryRings[0].length===safeNonCollinearRing.length);

const duplicatePreKeyDrain={...twoDrain,terminals:[term1,{...term1,id:id("terminal",2),catchmentId:id("catchment",2)}],catchments:[
  twoDrain.catchments[1],{...twoDrain.catchments[1],id:id("catchment",2),terminalId:id("terminal",2)}],retainedDepressionLinks:[
  {depressionToken:depB.token,catchmentId:id("catchment",1),terminalId:id("terminal",1)},
  {depressionToken:"depression-analysis:0000000000000002",catchmentId:id("catchment",2),terminalId:id("terminal",2)}]};
const duplicatePreKeyDep={...depB,token:"depression-analysis:0000000000000002"};
const duplicatePreKeyResult=safeCall(()=>modules.basins?.finalizeDepressionBasins?.(twoGrid.grid,depAnalysis([depB,duplicatePreKeyDep]),coastlineFor(twoGrid.grid),duplicatePreKeyDrain,twoGrid.constants));

const correctionValleys = safeCall(()=>modules.valleys?.deriveTerrainValleyGeometry?.(valleyGrid.grid,valleyDrainage,vc));
const correctionValleyValue=ok(correctionValleys);

const f6HardCodedRing = sameBytes(f6Value?.boundaryRings, [F_RING]) && area2(F_RING)/2===125000;
const diagonalSharedVertexSeparate = ok(rawForward)?.length===2 && (()=>{
  const first=ok(rawForward)?.[0]??[], second=ok(rawForward)?.[1]??[];
  const firstOpen=first.slice(0,-1), secondOpen=second.slice(0,-1);
  return firstOpen.some(a=>secondOpen.some(b=>a.xM===b.xM&&a.yM===b.yM));
})();
const countBoundConstants=structuredClone(vc); countBoundConstants.drainage.maxReaches=1;
const countBoundResult=safeCall(()=>modules.valleys?.deriveTerrainValleyGeometry?.(valleyGrid.grid,valleyDrainage,countBoundConstants));

async function runExorheicDownstreamClosedMutation() {
  const absent={mutationApplied:false,restored:true};
  if(!existsSync(BASINS_PATH))return absent;
  const original=readFileSync(BASINS_PATH);
  const source=original.toString("utf8");
  const needle='               item.persistentSpillElevationMeters !== item.physicalSpillElevationMeters ||\n';
  const replacement=needle+'               terminal.kind === "retained_closed_basin" ||\n';
  if(!source.includes(needle)||source.indexOf(needle)!==source.lastIndexOf(needle))return absent;
  let value;
  try {
    writeFileSync(BASINS_PATH,source.replace(needle,replacement));
    const mutated=await loadModules("?audit-task9-exorheic-downstream-closed-mutant");
    value=safeCall(()=>mutated.basins?.finalizeDepressionBasins?.(
      twoGrid.grid,depAnalysis([depB,f6Dep]),coastlineFor(twoGrid.grid),downstreamClosedDrain,twoGrid.constants));
  } finally {
    writeFileSync(BASINS_PATH,original);
  }
  return {mutationApplied:true,value,restored:readFileSync(BASINS_PATH).equals(original)};
}

async function runDomain3ScheduleMutations() {
  const absent={instrumentationApplied:false,noSortMutationApplied:false,allOriginalMutationApplied:false,restored:!existsSync(BASINS_PATH)};
  if(!existsSync(BASINS_PATH))return absent;
  const original=readFileSync(BASINS_PATH);
  const source=original.toString("utf8");
  const sortNeedle='  originalDomain.sort(compareBasinDomain3PreKey);\n';
  const featureNeedle='  for (let index = 0; index < originalDomain.length; index += 1) {\n    const candidate = originalDomain[index];\n';
  const featureReplacement='  for (let index = 0; index < originalDomain.length; index += 1) {\n    const candidate = originalDomain[index];\n    globalThis.__WORLD_M0_M02_D3_SCHEDULE__ ??= [];\n    globalThis.__WORLD_M0_M02_D3_SCHEDULE__.push({kind:"feature",index,token:candidate.analysis.token,domainLength:originalDomain.length,finalCount:finalDomain.length});\n';
  const peerNeedle='      const currentPeer = peer < index ? finalDomain[peer].boundaryRings : originalPeer;\n';
  const peerReplacement=peerNeedle+'      globalThis.__WORLD_M0_M02_D3_SCHEDULE__.push({kind:"peer",index,peer,state:peer < index ? "earlier" : "later",usesExpected:peer < index ? currentPeer === finalDomain[peer].boundaryRings : currentPeer === originalPeer});\n';
  if(!source.includes(sortNeedle)||!source.includes(featureNeedle)||!source.includes(peerNeedle))return absent;
  const instrumented=source.replace(featureNeedle,featureReplacement).replace(peerNeedle,peerReplacement);
  const run=async(mutatedSource,suffix)=>{
    writeFileSync(BASINS_PATH,mutatedSource);
    globalThis.__WORLD_M0_M02_D3_SCHEDULE__=[];
    const mutated=await loadModules(suffix);
    const value=safeCall(()=>mutated.basins?.finalizeDepressionBasins?.(twoGrid.grid,depAnalysis([f6Dep,depB]),coastlineFor(twoGrid.grid),twoDrain,twoGrid.constants));
    const trace=Array.isArray(globalThis.__WORLD_M0_M02_D3_SCHEDULE__)?globalThis.__WORLD_M0_M02_D3_SCHEDULE__.map((entry)=>({...entry})):undefined;
    delete globalThis.__WORLD_M0_M02_D3_SCHEDULE__;
    return {value,trace};
  };
  let canonical,noSort,allOriginal;
  try {
    canonical=await run(instrumented,"?audit-task9-d3-canonical");
    noSort=await run(instrumented.replace(sortNeedle,""),"?audit-task9-d3-no-sort");
    const allOriginalSource=instrumented.replace(peerNeedle,'      const currentPeer = originalPeer;\n');
    allOriginal=await run(allOriginalSource,"?audit-task9-d3-all-original");
  } finally {
    delete globalThis.__WORLD_M0_M02_D3_SCHEDULE__;
    writeFileSync(BASINS_PATH,original);
  }
  return {instrumentationApplied:true,noSortMutationApplied:true,allOriginalMutationApplied:true,canonical,noSort,allOriginal,restored:readFileSync(BASINS_PATH).equals(original)};
}

async function runBasinFloorIdentityMutations() {
  if(!existsSync(BASINS_PATH))return {sourceExists:false,restored:false,cases:{}};
  const original=readFileSync(BASINS_PATH);
  const source=original.toString("utf8");
  const cases={};
  const pairOrder=(result,fixture)=>{
    const value=ok(result);
    return Array.isArray(value)&&
      value.find((basin)=>sameBytes(basin.floorPoint,fixture.firstPoint))?.id===id("depression-basin",0)&&
      value.find((basin)=>sameBytes(basin.floorPoint,fixture.secondPoint))?.id===id("depression-basin",1);
  };
  const canonicalClosed=(result)=>{
    const value=ok(result)?.[0];
    return value?.floorPoint?.xM===625&&value?.floorPoint?.yM===625&&value?.floorElevationMeters===1;
  };
  const canonicalExorheic=(result)=>{
    const value=ok(result)?.[0];
    return value?.floorPoint?.xM===625&&value?.floorPoint?.yM===625&&value?.floorElevationMeters===1&&
      value?.outletTerminalId===id("terminal",0);
  };
  const run=async(name,mutate,invoke,isCanonical)=>{
    const mutated=mutate(source);
    if(typeof mutated!=="string"||mutated===source) {
      cases[name]={applied:false,killed:false,restored:readFileSync(BASINS_PATH).equals(original)};
      return;
    }
    let value,loadError;
    try {
      writeFileSync(BASINS_PATH,mutated);
      const loaded=await loadModules(`?audit-task9-basin-floor-${name}`);
      loadError=loaded.loadError;
      if(!loadError)value=invoke(loaded);
    } finally {
      writeFileSync(BASINS_PATH,original);
    }
    cases[name]={applied:true,killed:!loadError&&!isCanonical(value),loadError,restored:readFileSync(BASINS_PATH).equals(original)};
  };
  const pointBlock='  const floor = comparePointM(left.floorPoint, right.floorPoint);\n  if (floor !== 0) return floor;\n';
  const elevationBlock='  const floorElevation = compareNumber(left.analysis.floorElevationMeters, right.analysis.floorElevationMeters);\n  if (floorElevation !== 0) return floorElevation;\n';
  const finalSort='  finalDomain.sort(compareBasinFinalPhysicalKey);\n';
  const preSort='  originalDomain.sort(compareBasinDomain3PreKey);\n';
  const comparatorStart='function compareBasinFinalPhysicalKey(left: BasinCandidate, right: BasinCandidate): number {\n';
  const floorCellBlock='  const row = Math.floor(item.canonicalFloorCell / scratch.width);\n  const column = item.canonicalFloorCell - row * scratch.width;\n';
  const floorPersist='      floorPoint: candidate.floorPoint,\n';
  const elevationPersist='      floorElevationMeters: candidate.analysis.floorElevationMeters,\n';
  const invokePair=(fixture)=>(loaded)=>safeCall(()=>loaded.basins?.finalizeDepressionBasins?.(
    fixture.fixtureGrid.grid,fixture.analysis,coastlineFor(fixture.fixtureGrid.grid),fixture.drainage,fixture.fixtureGrid.constants));
  const mutateFinalComparator=(source,transform)=>{
    const start=source.indexOf(comparatorStart);
    if(start<0)return source;
    const end=source.indexOf('\n}\n',start);
    if(end<0)return source;
    const block=source.slice(start,end+3),mutated=transform(block);
    return mutated===block?source:source.slice(0,start)+mutated+source.slice(end+3);
  };
  await run("comparator-omits-point",s=>mutateFinalComparator(s,block=>block.includes(pointBlock)?block.replace(pointBlock,""):block),invokePair(xBeforeElevation),r=>pairOrder(r,xBeforeElevation));
  await run("elevation-first",s=>s.includes(pointBlock+elevationBlock)?s.replace(pointBlock+elevationBlock,elevationBlock+pointBlock):s,invokePair(xBeforeElevation),r=>pairOrder(r,xBeforeElevation));
  await run("swapped-axes",s=>mutateFinalComparator(s,block=>block.includes(pointBlock)?block.replace(pointBlock,
    '  const floorY = compareNumber(left.floorPoint.yM, right.floorPoint.yM);\n  if (floorY !== 0) return floorY;\n  const floorX = compareNumber(left.floorPoint.xM, right.floorPoint.xM);\n  if (floorX !== 0) return floorX;\n'):block),
    invokePair(xBeforeYAxisPriority),r=>pairOrder(r,xBeforeYAxisPriority));
  await run("insertion-order-tie-break",s=>s.includes(finalSort)&&s.includes(preSort)?s.replace(preSort,"").replace(finalSort,""):s,
    invokePair(xBeforeElevation),r=>pairOrder(r,xBeforeElevation));
  await run("physical-id-tie-break",s=>s.includes(comparatorStart)?s.replace(comparatorStart,comparatorStart+
    '  const idOrder = left.catchment.id < right.catchment.id ? -1 : left.catchment.id > right.catchment.id ? 1 : 0;\n  if (idOrder !== 0) return idOrder;\n'):s,
    invokePair(pointBeforePhysicalId),r=>pairOrder(r,pointBeforePhysicalId));
  await run("wrong-plateau-floor-cell",s=>s.includes(floorCellBlock)?s.replace(floorCellBlock,
    '  const mutatedFloorCell = item.canonicalFloorCell + 1;\n  const row = Math.floor(mutatedFloorCell / scratch.width);\n  const column = mutatedFloorCell - row * scratch.width;\n'):s,
    loaded=>safeCall(()=>loaded.basins?.finalizeDepressionBasins?.(f6Grid.grid,
      {retainedDepressions:[f6Dep],terminalOwners:{terminalKindByCell:f6Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f6Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
      coastlineFor(f6Grid.grid),drainageFor("retained_closed_basin"),f6Grid.constants)),canonicalClosed);
  await run("routing-elevation-as-raw-floor",s=>s.includes(elevationPersist)?s.replace(elevationPersist,
    '      floorElevationMeters: scratch.routingElevationMeters[candidate.analysis.canonicalFloorCell],\n'):s,
    loaded=>safeCall(()=>loaded.basins?.finalizeDepressionBasins?.(f6Grid.grid,
      {retainedDepressions:[f6Dep],terminalOwners:{terminalKindByCell:f6Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f6Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
      coastlineFor(f6Grid.grid),drainageFor("retained_closed_basin"),f6Grid.constants)),canonicalClosed);
  await run("exorheic-terminal-as-floor",s=>s.includes(floorPersist)?s.replace(floorPersist,'      floorPoint: candidate.terminal.point,\n'):s,
    loaded=>safeCall(()=>loaded.basins?.finalizeDepressionBasins?.(f7Grid.grid,
      {retainedDepressions:[f7Dep],terminalOwners:{terminalKindByCell:f7Grid.grid?.terminalKindByCell,terminalOrdinalByCell:f7Grid.grid?.terminalOrdinalByCell,terminalOwnerCells:new Int32Array(0),terminalCount:0},conditionedDepressionCount:1,repairOperationCount:0},
      coastlineFor(f7Grid.grid),f7Drain,f7Grid.constants)),canonicalExorheic);
  return {sourceExists:true,cases,restored:readFileSync(BASINS_PATH).equals(original)};
}

async function runDomains45ScheduleMutations() {
  const absent={instrumentationApplied:false,prematureMutationApplied:false,restored:!existsSync(VALLEYS_PATH)};
  if(!existsSync(VALLEYS_PATH))return absent;
  const original=readFileSync(VALLEYS_PATH);
  const source=original.toString("utf8");
  const finalizeNeedle='):WorldM0Result<readonly GeometryCandidate[]> {\n  // M03 domains 4/5: collect every unsimplified feature before this sort and before\n';
  const finalizeReplacement='):WorldM0Result<readonly GeometryCandidate[]> {\n  globalThis.__WORLD_M0_M02_D45_SCHEDULE__ ??= [];\n  globalThis.__WORLD_M0_M02_D45_SCHEDULE__.push({kind:"finalize",path,produced:globalThis.__WORLD_M0_M02_D45_PRODUCED__ ?? 0,domainLength:domain.length});\n  // M03 domains 4/5: collect every unsimplified feature before this sort and before\n';
  const producerNeedle='    const derived=deriveReachGeometry(authority,scratch,constants);if(!derived.ok)return derived;\n';
  const producerReplacement=producerNeedle+'    globalThis.__WORLD_M0_M02_D45_PRODUCED__=(globalThis.__WORLD_M0_M02_D45_PRODUCED__ ?? 0)+1;\n    globalThis.__WORLD_M0_M02_D45_SCHEDULE__ ??= [];\n    globalThis.__WORLD_M0_M02_D45_SCHEDULE__.push({kind:"producer",produced:globalThis.__WORLD_M0_M02_D45_PRODUCED__});\n';
  const valleyIdNeedle='    const ident=formatTerrainHydroId("valley",index);if(!ident.ok)return ident;\n';
  const valleyIdReplacement='    globalThis.__WORLD_M0_M02_D45_SCHEDULE__.push({kind:"id",path:"valleys",index,boundaryFinal:item.boundaryRings!==undefined});\n'+valleyIdNeedle;
  const floodIdNeedle='    const ident=formatTerrainHydroId("floodplain",index);if(!ident.ok)return ident;\n';
  const floodIdReplacement='    globalThis.__WORLD_M0_M02_D45_SCHEDULE__.push({kind:"id",path:"floodplainCandidates",index,boundaryFinal:item.boundaryRings!==undefined});\n'+floodIdNeedle;
  if(!source.includes(finalizeNeedle)||!source.includes(producerNeedle)||!source.includes(valleyIdNeedle)||!source.includes(floodIdNeedle))return absent;
  const instrumented=source.replace(finalizeNeedle,finalizeReplacement).replace(producerNeedle,producerReplacement).replace(valleyIdNeedle,valleyIdReplacement).replace(floodIdNeedle,floodIdReplacement);
  const prematureProducer=producerReplacement+'    if(globalThis.__WORLD_M0_M02_D45_PRODUCED__===1){\n      const auditPremature=finalizeGeometryDomain(valleyDomain,scratch,constants,"audit-premature-valleys");if(!auditPremature.ok)return auditPremature;\n      const auditEarlyId=formatTerrainHydroId("valley",0);if(!auditEarlyId.ok)return auditEarlyId;\n      globalThis.__WORLD_M0_M02_D45_SCHEDULE__.push({kind:"id",path:"audit-premature-valleys",index:0,boundaryFinal:false});\n    }\n';
  const premature=instrumented.replace(producerReplacement,prematureProducer);
  const run=async(mutatedSource,suffix)=>{
    writeFileSync(VALLEYS_PATH,mutatedSource);
    globalThis.__WORLD_M0_M02_D45_PRODUCED__=0; globalThis.__WORLD_M0_M02_D45_SCHEDULE__=[];
    const mutated=await loadModules(suffix);
    const value=safeCall(()=>mutated.valleys?.deriveTerrainValleyGeometry?.(valleyGrid.grid,valleyDrainage,vc));
    const trace=Array.isArray(globalThis.__WORLD_M0_M02_D45_SCHEDULE__)?globalThis.__WORLD_M0_M02_D45_SCHEDULE__.map((entry)=>({...entry})):undefined;
    delete globalThis.__WORLD_M0_M02_D45_PRODUCED__; delete globalThis.__WORLD_M0_M02_D45_SCHEDULE__;
    return {value,trace};
  };
  let canonical,prematureRun;
  try {
    canonical=await run(instrumented,"?audit-task9-d45-canonical");
    prematureRun=await run(premature,"?audit-task9-d45-premature");
  } finally {
    delete globalThis.__WORLD_M0_M02_D45_PRODUCED__; delete globalThis.__WORLD_M0_M02_D45_SCHEDULE__;
    writeFileSync(VALLEYS_PATH,original);
  }
  return {instrumentationApplied:true,prematureMutationApplied:true,canonical,premature:prematureRun,restored:readFileSync(VALLEYS_PATH).equals(original)};
}

const exorheicDownstreamClosedMutationAudit=await runExorheicDownstreamClosedMutation();
const domain3ScheduleAudit=await runDomain3ScheduleMutations();
const basinFloorIdentityMutationAudit=await runBasinFloorIdentityMutations();
const domains45ScheduleAudit=await runDomains45ScheduleMutations();
const d3CanonicalFeatures=domain3ScheduleAudit.canonical?.trace?.filter((entry)=>entry.kind==="feature")??[];
const d3NoSortFeatures=domain3ScheduleAudit.noSort?.trace?.filter((entry)=>entry.kind==="feature")??[];
const d3CanonicalPeers=domain3ScheduleAudit.canonical?.trace?.filter((entry)=>entry.kind==="peer")??[];
const d3AllOriginalPeers=domain3ScheduleAudit.allOriginal?.trace?.filter((entry)=>entry.kind==="peer")??[];
const domain3RuntimeScheduleWitness=domain3ScheduleAudit.instrumentationApplied&&domain3ScheduleAudit.noSortMutationApplied&&domain3ScheduleAudit.allOriginalMutationApplied&&domain3ScheduleAudit.restored&&
  ok(domain3ScheduleAudit.canonical?.value)&&d3CanonicalFeatures.length===2&&d3CanonicalFeatures[0]?.token===depB.token&&d3CanonicalFeatures[1]?.token===f6Dep.token&&
  d3CanonicalFeatures.every((entry,index)=>entry.domainLength===2&&entry.finalCount===index)&&d3CanonicalPeers.length===2&&d3CanonicalPeers.every((entry)=>entry.usesExpected===true)&&
  d3NoSortFeatures.length===2&&d3NoSortFeatures[0]?.token===f6Dep.token&&d3NoSortFeatures[1]?.token===depB.token&&
  d3AllOriginalPeers.some((entry)=>entry.state==="earlier"&&entry.usesExpected===false);

const d45Trace=domains45ScheduleAudit.canonical?.trace??[];
const d45Finalize=d45Trace.filter((entry)=>entry.kind==="finalize");
const d45Ids=d45Trace.filter((entry)=>entry.kind==="id");
const d45FirstFinalize=d45Trace.findIndex((entry)=>entry.kind==="finalize");
const d45FirstId=d45Trace.findIndex((entry)=>entry.kind==="id");
const d45PrematureTrace=domains45ScheduleAudit.premature?.trace??[];
const domains45RuntimeBarrierWitness=domains45ScheduleAudit.instrumentationApplied&&domains45ScheduleAudit.prematureMutationApplied&&domains45ScheduleAudit.restored&&
  ok(domains45ScheduleAudit.canonical?.value)&&d45Finalize.length===2&&d45Finalize.every((entry)=>entry.produced===2)&&
  d45FirstFinalize===2&&d45FirstId>d45Trace.map((entry)=>entry.kind).lastIndexOf("finalize")&&d45Ids.length>0&&d45Ids.every((entry)=>entry.boundaryFinal===true)&&
  d45PrematureTrace.some((entry)=>entry.kind==="finalize"&&entry.produced===1)&&d45PrematureTrace.some((entry)=>entry.kind==="id"&&entry.boundaryFinal===false);

const forbidden=/\b(season|frequency|wetland|waterDepth|discharge|rainfall|runoff|precipitation)\b/i;
const basinSource=existsSync(BASINS_PATH)?readFileSync(BASINS_PATH,"utf8"):"";
const valleySource=existsSync(VALLEYS_PATH)?readFileSync(VALLEYS_PATH,"utf8"):"";
const checks={
  authorityPresent: typeof modules.basins?.finalizeDepressionBasins === "function" && typeof modules.valleys?.deriveTerrainValleyGeometry === "function",
  domain3ConsumesFinalCoastlineAuthority: ok(correctionF6)?.[0]?.closedEndorheic===true,
  domains45ConsumeFinalDrainagePhysicalAuthority: Array.isArray(correctionValleyValue?.valleys) && Array.isArray(correctionValleyValue?.floodplainCandidates),
  toleranceDrivenNonCollinearDeletion: Array.isArray(nonCollinearAfter) && nonCollinearAfter[0]?.length < nonCollinearBeforeVertices,
  f5Absent: Array.isArray(ok(f5)) && ok(f5).length===0,
  f6RingIndependentHardCoded: f6HardCodedRing,
  f6ClosedExact: f6Value?.id===id("depression-basin",0) && f6Value?.catchmentId===id("catchment",0) &&
    f6Value?.floorPoint?.xM===625 && f6Value?.floorPoint?.yM===625 && f6Value?.floorElevationMeters===1 &&
    f6Value?.spillElevationMeters===null && f6Value?.outletTerminalId===null && f6Value?.closedEndorheic===true && f6Value?.areaM2===125000 &&
    ringRoleAreaExact(f6Value?.boundaryRings,125000),
  closedFloorMatchesReciprocalTerminal: f6Value?.floorPoint?.xM===625 && f6Value?.floorPoint?.yM===625 &&
    sameBytes(f6Value?.floorPoint,drainageFor("retained_closed_basin").terminals[0].point),
  rawFloorAuthorityNotConditionedRouting: f6Grid.grid?.elevationMeters[12]===1 && f6Grid.grid?.routingElevationMeters[12]===4 &&
    f6Value?.floorElevationMeters===f6Grid.grid?.elevationMeters[12] && f6Value?.floorElevationMeters!==f6Grid.grid?.routingElevationMeters[12],
  f6ContradictionRejected: err(f6Bad)?.code==="M02_CANDIDATE_INVALID" && /spill/i.test(err(f6Bad)?.path??err(f6Bad)?.detail??""),
  f7ExorheicExact: f7Value?.floorPoint?.xM===625 && f7Value?.floorPoint?.yM===625 && f7Value?.spillElevationMeters===4 && f7Value?.outletTerminalId===id("terminal",0) && f7Value?.closedEndorheic===false && f7Value?.areaM2===125000,
  f7ExorheicOceanExact: f7OceanValue?.floorPoint?.xM===625 && f7OceanValue?.floorPoint?.yM===625 && f7OceanValue?.spillElevationMeters===4 && f7OceanValue?.outletTerminalId===id("terminal",0) && f7OceanValue?.closedEndorheic===false,
  exorheicDownstreamClosedAccepted: Array.isArray(exorheicDownstreamClosedValue) && exorheicDownstreamClosedValue.length===2 &&
    exorheicDownstreamClosedValue.some((basin)=>basin.closedEndorheic===false && basin.floorPoint?.xM===125 && basin.floorPoint?.yM===125 &&
      !sameBytes(basin.floorPoint,term0.point) && basin.spillElevationMeters===5 && basin.outletTerminalId===term0.id && basin.catchmentId===term0.catchmentId) &&
    exorheicDownstreamClosedValue.some((basin)=>basin.closedEndorheic===true && sameBytes(basin.floorPoint,term0.point) && basin.spillElevationMeters===null && basin.outletTerminalId===null && basin.catchmentId===term0.catchmentId),
  coordinateBeforeElevationPhysicalIdOrder: (()=>{const value=ok(xBeforeElevation.result); return Array.isArray(value) &&
    value.find((basin)=>sameBytes(basin.floorPoint,xBeforeElevation.firstPoint))?.id===id("depression-basin",0) &&
    value.find((basin)=>sameBytes(basin.floorPoint,xBeforeElevation.secondPoint))?.id===id("depression-basin",1);})(),
  yCoordinatePriorityPhysicalIdOrder: (()=>{const value=ok(yBeforeElevation.result); return Array.isArray(value) &&
    value.find((basin)=>sameBytes(basin.floorPoint,yBeforeElevation.firstPoint))?.id===id("depression-basin",0) &&
    value.find((basin)=>sameBytes(basin.floorPoint,yBeforeElevation.secondPoint))?.id===id("depression-basin",1);})(),
  xCoordinatePrecedesYAxisPhysicalIdOrder: (()=>{const value=ok(xBeforeYAxisPriority.result); return Array.isArray(value) &&
    value.find((basin)=>sameBytes(basin.floorPoint,xBeforeYAxisPriority.firstPoint))?.id===id("depression-basin",0) &&
    value.find((basin)=>sameBytes(basin.floorPoint,xBeforeYAxisPriority.secondPoint))?.id===id("depression-basin",1);})(),
  physicalIdsCannotBreakFloorPointTiesEarly: (()=>{const value=ok(pointBeforePhysicalId.result); return Array.isArray(value) &&
    value.find((basin)=>sameBytes(basin.floorPoint,pointBeforePhysicalId.firstPoint))?.id===id("depression-basin",0) &&
    value.find((basin)=>sameBytes(basin.floorPoint,pointBeforePhysicalId.secondPoint))?.id===id("depression-basin",1);})(),
  hiddenFloorV2RetainedStateCannotDistinguish: hiddenFloorV2CannotDistinguish,
  duplicateCompleteFinalBasinKeyRejectedBeforeIds: err(duplicateFinalKeyResult)?.code==="M02_CANDIDATE_INVALID" && /final|key|duplicate/i.test(err(duplicateFinalKeyResult)?.detail??""),
  floorOutsideBasinRejected: err(floorOutsideBasinResult)?.code==="M02_CANDIDATE_INVALID" && /floor/i.test(err(floorOutsideBasinResult)?.path??err(floorOutsideBasinResult)?.detail??""),
  floorInsideExcludedHoleRejected: err(floorInsideHoleResult)?.code==="M02_CANDIDATE_INVALID" && /floor/i.test(err(floorInsideHoleResult)?.path??err(floorInsideHoleResult)?.detail??""),
  floorOutsideCatchmentRejected: err(floorOutsideCatchmentResult)?.code==="M02_CANDIDATE_INVALID" && /floor/i.test(err(floorOutsideCatchmentResult)?.path??err(floorOutsideCatchmentResult)?.detail??""),
  closedFloorTerminalMismatchRejected: err(closedTerminalMismatchResult)?.code==="M02_CANDIDATE_INVALID" && /floor|terminal/i.test(err(closedTerminalMismatchResult)?.path??err(closedTerminalMismatchResult)?.detail??""),
  conditionedRoutingElevationCannotSubstituteRawFloor: err(conditionedElevationSubstitutionResult)?.code==="M02_CANDIDATE_INVALID" && /floor|elevation/i.test(err(conditionedElevationSubstitutionResult)?.path??err(conditionedElevationSubstitutionResult)?.detail??""),
  closedRejectsNonclosedTerminal: [f6OceanBad,f6ExternalBad].every((result)=>err(result)?.code==="M02_CANDIDATE_INVALID" && /spill/i.test(err(result)?.path??err(result)?.detail??"")),
  malformedExorheicTupleRejected: [f7ProtectedBad,f7NullSpillBad,f7MismatchSpillBad].every((result)=>err(result)?.code==="M02_CANDIDATE_INVALID" && /spill/i.test(err(result)?.path??err(result)?.detail??"")),
  malformedExorheicLinkageRejected: [f7MissingCatchmentBad,f7NonreciprocalBad].every((result)=>err(result)?.code==="M02_CANDIDATE_INVALID" && /retainedDepressionLinks/i.test(err(result)?.path??err(result)?.detail??"")),
  exorheicDownstreamClosedMutationDiscriminated: exorheicDownstreamClosedMutationAudit.mutationApplied===true && exorheicDownstreamClosedMutationAudit.restored===true &&
    err(exorheicDownstreamClosedMutationAudit.value)?.code==="M02_CANDIDATE_INVALID" && err(exorheicDownstreamClosedMutationAudit.value)?.path==="retainedDepressions.spill",
  basinFloorIdentityMutantsKilledByBehavior: basinFloorIdentityMutationAudit.sourceExists===true && basinFloorIdentityMutationAudit.restored===true &&
    Object.values(basinFloorIdentityMutationAudit.cases).length===8 && Object.values(basinFloorIdentityMutationAudit.cases).every((entry)=>entry.applied===true&&entry.killed===true&&!entry.loadError&&entry.restored===true),
  domain3OrderAndRingRegistryInvariant: ok(d3Forward) && ok(d3Reverse) && sameBytes(ok(d3Forward),ok(d3Reverse)),
  domain3ExactPreKeyRejectsEqualPhysicalTuples: err(duplicatePreKeyResult)?.code==="M02_CANDIDATE_INVALID" && /pre-key/i.test(err(duplicatePreKeyResult)?.detail??""),
  domain3FinalReferenceProtection: referenceProtectionWitness && domain3FinalCoastlineWitness,
  domain3CompletePeerSchedule: domain3RuntimeScheduleWitness,
  earlierFinalLaterOriginalReferenceSemantics: earlierFinalLaterOriginalWitness && domain3RuntimeScheduleWitness,
  domain3IdsAfterGeometry: ok(d3Forward)?.every((b,i)=>b.id===id("depression-basin",i)),
  equivalentTask9PhysicalInputsPreserveReviewedBasinIds: ok(d3Forward)?.find((b)=>b.catchmentId===id("catchment",1))?.id===id("depression-basin",0) &&
    ok(d3Forward)?.find((b)=>b.catchmentId===id("catchment",0))?.id===id("depression-basin",1),
  valleyProduced: Array.isArray(vv?.valleys) && vv.valleys.length>=1 && vv.valleys.every(v=>v.areaM2>0 && v.boundaryRings.length>0),
  floodplainProducedNearReach: Array.isArray(vv?.floodplainCandidates) && vv.floodplainCandidates.length>=1,
  isolatedFlatExcluded: vv?.floodplainCandidates?.every(fp=>fp.boundaryRings.every(r=>!r.some(p=>p.xM===0 && p.yM===1750))) ?? false,
  domains45InputOrderInvariant: vv && vvRev && sameBytes(vv,vvRev),
  domains45UseReachPhysicalPreKey: reachPhysicalIdWitness===true && exactTask8PhysicalKeyWitness===true,
  domains45IdsAfterFinalGeometry: vv?.valleys?.every((v,i)=>v.id===id("valley",i)) && vv?.floodplainCandidates?.every((v,i)=>v.id===id("floodplain",i)) && domains45RuntimeBarrierWitness,
  domains45CompleteBeforeDeletion: domains45RuntimeBarrierWitness,
  domains45RawRingProducerOrderInvariant: ok(rawForward)?.length===2 && sameBytes(ok(rawForward),ok(rawReverse)) && ok(rawForward)?.every((r)=>area2(r)>0),
  diagonalSharedVertexOuterRingsStaySeparate: diagonalSharedVertexSeparate,
  candidateCountOverflowFailsClosed: err(countBoundResult)?.code==="M02_BOUND_EXCEEDED",
  longReachUsesBoundedLocalCorridor: ok(longCorridor)?.valleys?.length===1 && err(longCorridor)===undefined,
  candidateKeysExact: vv?.valleys?.every(v=>exactKeys(v,["id","reachId","boundaryRings","areaM2","localReliefMeters"])) &&
    vv?.floodplainCandidates?.every(v=>exactKeys(v,["id","reachId","boundaryRings","areaM2","terrainSlope"])),
  noHydraulicEpistemicFields: !forbidden.test(basinSource) && !forbidden.test(valleySource),
  task9DenseAnalysisUsesScratchBudget: Boolean(valleyBudgetBefore && valleyBudgetAfter && valleyBudgetAfter.liveBytes===valleyBudgetBefore.liveBytes && valleyBudgetAfter.peakBytes>valleyBudgetBefore.peakBytes),
  basinFloorIdentityAddsNoDenseScratchAllocation: !/new\s+(?:Float(?:32|64)|Uint(?:8|16|32)|Int(?:8|16|32))Array/.test(basinSource),
  noJsPerCellMembership: !/new\s+Set<number>|(?:valleyCells|floodCells)\s*:\s*number\[\]/.test(valleySource),
  mutationSourcesRestoredByteIdentically: exorheicDownstreamClosedMutationAudit.restored===true && domain3ScheduleAudit.restored===true && basinFloorIdentityMutationAudit.restored===true && domains45ScheduleAudit.restored===true,
  polygonBoundFailure: (()=>{ const c=structuredClone(vc); c.geometry.maxPolygonVerticesPerFeature=4; const one={...valleyDrainage,terminals:[valleyTerminals[0]],catchments:[valleyCatchments[0]],nodes:valleyNodes.slice(0,2),reaches:[reachA]}; const r=safeCall(()=>modules.valleys?.deriveTerrainValleyGeometry?.(valleyGrid.grid,one,c)); return err(r)?.code==="M02_BOUND_EXCEEDED"; })(),
};
const passed=Object.values(checks).every(Boolean);
console.log(JSON.stringify({audit:"WORLD-M0 M0.2 Task 9 basin/valley geometry",checks,evidence:{basinFloorIdentityMutations:basinFloorIdentityMutationAudit.cases,duplicateFinalKeyError:err(duplicateFinalKeyResult),floorOutsideBasinError:err(floorOutsideBasinResult),floorInsideHoleError:err(floorInsideHoleResult),floorOutsideCatchmentError:err(floorOutsideCatchmentResult),closedTerminalMismatchError:err(closedTerminalMismatchResult),conditionedElevationSubstitutionError:err(conditionedElevationSubstitutionResult),exorheicDownstreamClosedError:err(exorheicDownstreamClosed),exorheicDownstreamClosedMutationError:err(exorheicDownstreamClosedMutationAudit.value),exorheicDownstreamClosedMutationRestored:exorheicDownstreamClosedMutationAudit.restored,f6OceanError:err(f6OceanBad),f6ExternalError:err(f6ExternalBad),f7ProtectedError:err(f7ProtectedBad),f7NullSpillError:err(f7NullSpillBad),f7MismatchSpillError:err(f7MismatchSpillBad),f7MissingCatchmentError:err(f7MissingCatchmentBad),f7NonreciprocalError:err(f7NonreciprocalBad),nonCollinearAfter,referenceProtectedValue,earlierFinalValue,domain3FinalCoastlineWitness,exactTask8PhysicalKeyWitness,domain3Schedule:domain3ScheduleAudit.canonical?.trace,domain3NoSortSchedule:domain3ScheduleAudit.noSort?.trace,domain3AllOriginalSchedule:domain3ScheduleAudit.allOriginal?.trace,domains45Schedule:d45Trace,domains45PrematureSchedule:d45PrematureTrace},loadError:modules.loadError,verdict:passed?"PASS":"FAIL"},null,2));
for(const g of [f5Grid.grid,f6Grid.grid,f7Grid.grid,twoGrid.grid,xBeforeElevation.fixtureGrid.grid,yBeforeElevation.fixtureGrid.grid,xBeforeYAxisPriority.fixtureGrid.grid,pointBeforePhysicalId.fixtureGrid.grid,valleyGrid.grid,longGrid.grid]) releaseGrid(g);
if(!passed) process.exitCode=1;
