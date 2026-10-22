const fs = require('fs');
let c = fs.readFileSync('src/app/api/clients/[clientIdCode]/route.ts', 'utf8');
// Add boolean conversion in PUT update payload
c = c.replace(
  'if (FIELD_TO_COLUMN[field]) {\n    updatePayload[FIELD_TO_COLUMN[field]] = value;\n  }',
  'if (FIELD_TO_COLUMN[field]) {\n    const col = FIELD_TO_COLUMN[field];\n    const isBoolean = ["brandRegistry", "feedbackWhiz", "levanta", "portalTimelineEnabled"].includes(col as string);\n    updatePayload[col] = isBoolean ? (value === "true") : value;\n  }'
);
fs.writeFileSync('src/app/api/clients/[clientIdCode]/route.ts', c);
console.log('PUT boolean conversion done');