const fs = require('fs');
let c = fs.readFileSync('src/app/api/clients/[clientIdCode]/route.ts', 'utf8');
c = c.replace('      id: client.id,\n', '');
c = c.replace(/\n      updatedAt: \(client as any\)\.updatedAt \? client\.updatedAt\.toISOString\(\) : null,/, '');
fs.writeFileSync('src/app/api/clients/[clientIdCode]/route.ts', c);
console.log('GET route fixed');

let d = fs.readFileSync('src/components/clients/client-detail.tsx', 'utf8');
d = d.replace('    id: number;\n', '');
d = d.replace('    updatedAt: string | null;\n', '');
fs.writeFileSync('src/components/clients/client-detail.tsx', d);
console.log('Component fixed');