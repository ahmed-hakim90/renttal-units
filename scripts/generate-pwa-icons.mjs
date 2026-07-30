import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const sourceSvg = path.join(root, 'public/brand/logo-icon.svg');
const iconsDir = path.join(root, 'public/icons');
const appDir = path.join(root, 'src/app');

const sizes = [16, 32, 48, 72, 96, 128, 144, 152, 192, 384, 512];

async function generate() {
  await mkdir(iconsDir, { recursive: true });
  const svg = await readFile(sourceSvg);

  for (const size of sizes) {
    const png = await sharp(svg).resize(size, size).png().toBuffer();
    await writeFile(path.join(iconsDir, `icon-${size}.png`), png);
  }

  const maskable = await sharp(svg)
    .resize(512, 512)
    .extend({
      top: 64,
      bottom: 64,
      left: 64,
      right: 64,
      background: { r: 6, g: 27, b: 67, alpha: 1 },
    })
    .png()
    .toBuffer();
  await writeFile(path.join(iconsDir, 'icon-maskable-512.png'), maskable);

  await copyFile(sourceSvg, path.join(appDir, 'icon.svg'));
  await sharp(svg).resize(180, 180).png().toFile(path.join(appDir, 'apple-icon.png'));
  await sharp(svg).resize(32, 32).png().toFile(path.join(appDir, 'favicon.ico'));

  console.log('Generated PWA icons in public/icons/');
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
