import fs from 'fs';
import path from 'path';

function walkDir(dir: string, callback: (filePath: string) => void) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
    });
}

const targetDir = path.join(process.cwd(), 'components');

walkDir(targetDir, (filePath) => {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        let content = fs.readFileSync(filePath, 'utf-8');
        let originalContent = content;
        
        // Base Backgrounds
        content = content.replace(/(?<!hover:)bg-tint-([a-z]+)-bg(?!\/)/g, 'bg-tint-$1-bg/10');
        
        // Hover Backgrounds
        content = content.replace(/hover:bg-tint-([a-z]+)-bg(?!\/)/g, 'hover:bg-tint-$1-bg/20');
        
        // Borders
        content = content.replace(/border-tint-([a-z]+)-border(?!\/)/g, 'border-tint-$1-border/20');

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf-8');
            console.log(`Updated ${filePath}`);
        }
    }
});
