import {rm} from 'node:fs/promises'

// Only the repository's generated VuePress cache, never dependencies or service data.
await rm(new URL('../build/cache/',import.meta.url),{recursive:true,force:true})
console.log('Cleaned generated website build cache')
