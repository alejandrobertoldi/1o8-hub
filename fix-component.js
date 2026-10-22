const fs = require('fs');
let d = fs.readFileSync('src/components/clients/client-detail.tsx', 'utf8');
d = d.replace('    id: number;\n', '');
d = d.replace('    updatedAt: string | null;\n', '');
fs.writeFileSync('src/components/clients/client-detail.tsx', d);
console.log('Component type fixed');