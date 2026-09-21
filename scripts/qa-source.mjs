import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
/** Both source and built bundle are recorded: a stale preview cannot masquerade as current source. */
export async function qaSource() {
 const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','scripts','package.json','package-lock.json']).toString().trim().split('\n')
 const sourceFiles=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])))
 const dist=process.env.QA_DIST??'dist';const html=await readFile(dist+'/index.html','utf8');const js=html.match(/src="[^\"]*\/assets\/([^\"]+\.js)"/)[1]
 return {remoteBase:'6a8ef56bbaece739876b052025b9958f41e79ba8',sourceFiles,sourceDigest:createHash('sha256').update(JSON.stringify(sourceFiles)).digest('hex'),bundle:{file:js,sha256:createHash('sha256').update(await readFile(dist+'/assets/'+js)).digest('hex')}}
}
