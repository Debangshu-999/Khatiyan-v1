const sharp = require('C:/Users/Ezio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const path = require('path');

async function main() {
  const source = 'C:/Users/Ezio/.codex/generated_images/01a05d70-4028-70e3-a5e0-41ec0efce3f6/exec-423791c7-2fc0-45ce-b8b2-bae082d8754a.png';
  const target = path.resolve(__dirname, '../assets/images/workspace/service-balance-purple-wallet.png');
  await sharp(source)
    .trim()
    .resize(168, 138, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(target);
  const metadata = await sharp(target).metadata();
  console.log(JSON.stringify({ target, width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
