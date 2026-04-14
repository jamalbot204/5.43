import fs from 'fs';
import path from 'path';

const files = [
    'components/settings/SettingsGeneral.tsx',
    'components/settings/SettingsAdvanced.tsx',
    'components/settings/SettingsToolsContext.tsx'
];

files.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    let content = fs.readFileSync(filePath, 'utf-8');
    let originalContent = content;

    // Replace the gradient classes with bg-bg-panel
    content = content.replace(/bg-gradient-to-r from-tint-[a-z]+-bg(?:\/\d+)? to-transparent/g, 'bg-bg-panel');
    content = content.replace(/bg-gradient-to-r from-bg-element to-transparent/g, 'bg-bg-panel');

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`Updated ${filePath}`);
    }
});
