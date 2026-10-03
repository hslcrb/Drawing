import fs from 'node:fs/promises';
const packages=['paper','react','react-dom','lucide-react'];
let notices='Drawing third-party notices\n\n';
for(const name of packages){const info=JSON.parse(await fs.readFile(`node_modules/${name}/package.json`,'utf8'));let license;for(const file of ['LICENSE','LICENSE.txt']){try{license=await fs.readFile(`node_modules/${name}/${file}`,'utf8');break;}catch{}}if(!license)throw new Error(`Missing license: ${name}`);notices+=`${name} ${info.version}\n${'='.repeat(60)}\n${license}\n\n`;}
await fs.writeFile('THIRD_PARTY_NOTICES.txt',notices);
