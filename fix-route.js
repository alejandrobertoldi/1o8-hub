const fs = require('fs');
let c = fs.readFileSync('src/app/api/clients/route.ts', 'utf8');
// Fix POST - remove id reference
c = c.replace('.select({ id: aacMaster.id })', '.select({ clientIdCode: aacMaster.clientIdCode })');
c = c.replace('if (existing.length > 0)', 'if (existing.length > 0)');
fs.writeFileSync('src/app/api/clients/route.ts', c);
console.log('POST route fixed');