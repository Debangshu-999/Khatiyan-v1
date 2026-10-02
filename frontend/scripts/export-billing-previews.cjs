const fs = require('fs');
const path = require('path');
const sharp = require('C:/Users/Ezio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const directory = path.resolve(__dirname, '../assets/vector-drawings/preview');
const source = fs.readFileSync(path.join(directory, 'billing-approval.svg'), 'utf8');
const defs = source.match(/<defs>([\s\S]*?)<\/defs>/)[1];
const icons = ['cycles', 'overdue', 'other', 'paid', 'unpaid', 'discount', 'history', 'bills', 'report', 'setup'];
(async () => {
  for (let i = 0; i < icons.length; i++) {
    const id = icons[i];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="-8 -8 80 80"><defs>${defs}</defs><g fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" color="${i < 6 ? '#000000' : '#4775C5'}"><use href="#${id}"/></g></svg>`;
    fs.writeFileSync(path.join(directory, `billing-${id}.svg`), svg);
    await sharp(Buffer.from(svg)).flatten({ background: '#ffffff' }).png().toFile(path.join(directory, `billing-${id}.png`));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
