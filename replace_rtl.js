import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'components/settings/SettingsToolsContext.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/mr-/g, 'me-');
content = content.replace(/ml-/g, 'ms-');
content = content.replace(/pr-/g, 'pe-');
content = content.replace(/pl-/g, 'ps-');
content = content.replace(/border-l-/g, 'border-s-');
content = content.replace(/border-r-/g, 'border-e-');
content = content.replace(/rounded-l-/g, 'rounded-s-');
content = content.replace(/rounded-r-/g, 'rounded-e-');

fs.writeFileSync(filePath, content);
console.log('Replacements done.');
