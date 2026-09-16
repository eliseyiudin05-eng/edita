import {spawn} from "node:child_process";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const nextBin=require.resolve("next/dist/bin/next");
const incoming=process.argv.slice(2);
const args=[];
for(let index=0;index<incoming.length;index++){
  const arg=incoming[index];
  if(arg==="--strictPort")continue;
  args.push(arg==="--host"?"--hostname":arg);
}

const child=spawn(process.execPath,[nextBin,"dev",...args],{stdio:"inherit",env:process.env});
child.on("exit",code=>process.exit(code??1));
for(const signal of ["SIGINT","SIGTERM"]){process.on(signal,()=>child.kill(signal))}
