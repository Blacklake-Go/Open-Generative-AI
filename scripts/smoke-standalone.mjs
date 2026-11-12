import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { requireIsolatedTestDatabase } from './test-database-guard.mjs';
const database=requireIsolatedTestDatabase(process.env.TEST_DATABASE_URL,process.env.DATABASE_URL);
const root=process.cwd();const port=Number(process.env.STANDALONE_SMOKE_PORT||3111);
const base=`http://127.0.0.1:${port}`;
const directory=path.resolve(process.env.NEXT_DIST_DIR||'.next','standalone');
const child=spawn(process.execPath,[path.join(directory,'server.js')],{cwd:directory,env:{...process.env,DATABASE_URL:database.href,PORT:String(port),HOSTNAME:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
let diagnostics='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{diagnostics=(diagnostics+chunk.toString()).slice(-12000);});
const checks=[];
try {
  // The exported package must carry its own migration tooling; it cannot rely
  // on the build checkout or production node_modules during rollout.
  const migration=spawnSync(process.execPath,['--experimental-loader','./scripts/server-only-loader.mjs','scripts/migrate.mjs'],{cwd:directory,env:{...process.env,DATABASE_URL:database.href},encoding:'utf8',timeout:120000});
  diagnostics+=migration.stdout||'';diagnostics+=migration.stderr||'';
  if(migration.error||migration.status!==0)throw new Error('Standalone migration tooling failed against the isolated test database');
  checks.push({migrationTooling:true,isolatedDatabaseOnly:true,status:'passed'});
  let ready=false;
  for(let count=0;count<90;count++) {
    if(child.exitCode!==null)throw new Error('Standalone server exited before liveness');
    try {const response=await fetch(`${base}/api/live`,{signal:AbortSignal.timeout(2000)});if(response.status===200){ready=true;break;}}catch{}
    await delay(500);
  }
  if(!ready)throw new Error('Standalone liveness was not observed');
  checks.push({path:'/api/live',status:200});
  for(const url of ['/community','/account/connected','/ja-JP/community/submit']) {
    const response=await fetch(base+url,{signal:AbortSignal.timeout(20000)});
    if(response.status!==200)throw new Error(`Standalone page failed: ${url} (${response.status})`);
    const html=await response.text();checks.push({path:url,status:response.status});
    const assets=[...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(match=>match[1]))].slice(0,4);
    if(!assets.length)throw new Error(`No compiled assets referenced by ${url}`);
    for(const asset of assets){const target=new URL(asset,base);if(target.origin!==base)throw new Error('Unexpected external compiled asset');const result=await fetch(target,{signal:AbortSignal.timeout(10000)});if(result.status!==200)throw new Error(`Standalone compiled asset failed (${result.status})`);checks.push({asset:target.pathname,status:200});}
  }
  const result={standaloneRuntimeSmoke:true,isolatedDatabaseOnly:true,providerGenerationTested:false,checks};
  await fs.writeFile(path.join(root,'outputs','standalone-smoke.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} catch(error) {
  let safeDiagnostics=diagnostics;
  for(const [name,value] of Object.entries(process.env)) if(!name.startsWith('NEXT_PUBLIC_')&&/SECRET|TOKEN|PRIVATE_KEY|DATABASE_URL|API_KEY/.test(name)&&value?.length>=8) safeDiagnostics=safeDiagnostics.split(value).join('[REDACTED]');
  safeDiagnostics=safeDiagnostics.replace(/postgres(?:ql)?:\/\/[^\s'\"]+/gi,'[REDACTED_DATABASE_URL]');
  await fs.writeFile(path.join(root,'outputs','standalone-smoke.log'),safeDiagnostics);
  console.error(safeDiagnostics);
  throw new Error(error.message,{cause:{serverExited:child.exitCode}});
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000)]);
  if(child.exitCode===null)child.kill('SIGKILL');
}
