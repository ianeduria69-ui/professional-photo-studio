import sharp from 'sharp';
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#2a5db0"/><ellipse cx="400" cy="420" rx="170" ry="220" fill="#e0a98a"/><rect x="150" y="700" width="500" height="300" rx="120" fill="#333"/><circle cx="330" cy="380" r="18" fill="#222"/><circle cx="470" cy="380" r="18" fill="#222"/></svg>');
await sharp(svg).jpeg({quality:92}).toFile('/tmp/claude-0/-home-claude/52139727-53ca-519e-8939-7b375d4f3dbb/scratchpad/portrait.jpg');
await sharp(svg).png().toFile('/tmp/claude-0/-home-claude/52139727-53ca-519e-8939-7b375d4f3dbb/scratchpad/portrait.png');
console.log('img ok');
