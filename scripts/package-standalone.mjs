import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const dist = path.resolve(process.env.NEXT_DIST_DIR || '.next');
if (!dist.startsWith(root + path.sep)) throw new Error('Build output must remain inside this checkout');
const standalone = path.join(dist, 'standalone');
await fs.access(path.join(standalone, 'server.js'));
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  try { await fs.access(path.join(standalone,name)); } catch (error) { if (error.code==='ENOENT') continue; throw error; }
  throw new Error(`Refusing to package a loaded runtime configuration file: ${name}`);
}
const git = (...args) => execFileSync('git',args,{encoding:'utf8'}).trim();
const checkedOutCommit = git('rev-parse','HEAD');
const sourceTree = git('rev-parse','HEAD^{tree}');
// Only reviewed static assets from Git are included. Existing production user
// uploads remain in their own retained data location during deployment.
const publicFiles = execFileSync('git',['ls-files','-z','public']).toString().split('\0').filter(Boolean);
for (const name of publicFiles) {
  if (name.startsWith('public/uploads/') && name !== 'public/uploads/.gitkeep') throw new Error('Refusing to package user uploads');
  const source = path.join(root,name);
  const stat = await fs.lstat(source);
  if (!stat.isFile()) throw new Error(`Static asset must be a regular tracked file: ${name}`);
  const destination = path.join(standalone,name);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.copyFile(source,destination);
}
await fs.cp(path.join(dist,'static'),path.join(standalone,'.next','static'),{recursive:true});
// Migration/status tooling reads these files at runtime. Copy only reviewed
// tracked source, never a runtime database/cache placed beside it.
const databaseFiles=execFileSync('git',['ls-files','-z','lib/db']).toString().split('\0').filter(Boolean);
for(const name of databaseFiles){const destination=path.join(standalone,name);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(root,name),destination);}
await fs.mkdir(path.join(standalone,'scripts'),{recursive:true});
for (const name of ['migrate.mjs','server-only-loader.mjs']) await fs.copyFile(path.join(root,'scripts',name),path.join(standalone,'scripts',name));
const metadata = { candidateOnly:true,sourceCommit:process.env.RELEASE_SOURCE_HEAD||checkedOutCommit,checkedOutCommit,sourceTree,
  buildId:(await fs.readFile(path.join(dist,'BUILD_ID'),'utf8')).trim(),nodeVersion:process.version,
  staticAssetsFromGit:publicFiles.length,runtimeEnvironmentFilesIncluded:false,userUploadsIncluded:false };
await fs.writeFile(path.join(standalone,'release-metadata.json'),JSON.stringify(metadata,null,2)+'\n');
// Catch accidentally compiled private environment values before exporting the
// candidate. Public browser configuration is intentionally not treated as secret.
const privateValues=Object.entries(process.env).filter(([name,value])=>!name.startsWith('NEXT_PUBLIC_')&&/SECRET|TOKEN|PRIVATE_KEY|DATABASE_URL|API_KEY/.test(name)&&value?.length>=8);
async function inspect(directory) {
  for (const entry of await fs.readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    const relative=path.relative(standalone,file).split(path.sep).join('/');
    if (relative.startsWith('public/uploads/') && relative !== 'public/uploads/.gitkeep') throw new Error('User upload found in traced output');
    if (/^\.env(?:$|\.(?:local|production|production\.local)$)/.test(entry.name)) throw new Error('Runtime environment file found in traced output');
    if (entry.isSymbolicLink()) {const target=await fs.realpath(file);if(!target.startsWith(standalone+path.sep))throw new Error('Traced symlink escapes candidate');}
    if (entry.isDirectory()) await inspect(file);
    else if (entry.isFile()) {
      const bytes=await fs.readFile(file);
      for (const [name,value] of privateValues) if(bytes.includes(Buffer.from(value))) throw new Error(`Private environment value embedded in candidate: ${name}`);
    }
  }
}
await inspect(standalone);
await fs.mkdir(path.join(root,'outputs'),{recursive:true});
execFileSync('tar',['-czf',path.join(root,'outputs','one-standalone.tgz'),'-C',standalone,'.']);
console.log(JSON.stringify(metadata));
