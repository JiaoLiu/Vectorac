import {HEROES,ALLIANCES}from '../.private/fengshen/theme.mjs'
import {CANONICAL_ROSTER,auditCanonicalRoster}from '../.private/fengshen/canonical-roster.mjs'
const issues=auditCanonicalRoster(HEROES,ALLIANCES)
console.log(JSON.stringify({model:'one-reference-general-per-hero',ready:issues.length===0,targetProfiles:CANONICAL_ROSTER.length,currentEnabled:HEROES.filter(h=>h.playable).length,issues},null,2))
if(process.argv.includes('--check')&&issues.length)process.exitCode=1
