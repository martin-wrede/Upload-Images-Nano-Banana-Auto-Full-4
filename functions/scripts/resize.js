const path = require('path');
const fs = require('fs/promises');
const fg = require('fast-glob');
const sharp = require('sharp');
const pLimit = require('p-limit');

const sizes = [1920, 1280, 800]; // target widths
const concurrency = 4;

async function ensureDir(d) { await fs.mkdir(d, { recursive: true }); }

// Assuming "_down" folder is at the project root
// __dirname is "functions/scripts", so "../../_down" goes to project root -> _down
const SRC_ROOT = path.resolve(__dirname, '../../_down');

(async () => {
  // Check if SRC_ROOT exists
  try {
    await fs.access(SRC_ROOT);
  } catch {
    console.error(`Source directory not found: ${SRC_ROOT}`);
    process.exit(1);
  }

  // Find all items in the SRC_ROOT
  const clientDirs = await fg(['*/'], { cwd: SRC_ROOT, absolute: true, onlyDirectories: true });

  // P-Limit for concurrency
  const limit = pLimit(concurrency);

  await Promise.all(clientDirs.map(clientPath => limit(async () => {
    const clientDirName = path.basename(clientPath);

    // Logic: specific handling for folders ending in "_down"
    // e.g. "martin_wrede_web_de_down" -> "martin_wrede_web_de_comp"
    if (!clientDirName.endsWith('_down')) {
      console.log(`Skipping ${clientDirName} (does not end with _down)`);
      return;
    }

    console.log(`Processing client: ${clientDirName}`);

    // Create the new folder name by replacing the suffix
    // "martin_wrede_web_de_down" -> "martin_wrede_web_de_comp"
    const newDirName = clientDirName.slice(0, -5) + '_comp';

    // Output at the project root (sibling to the _down folder)
    // SRC_ROOT is .../_down, so parent is project root.
    const projectRoot = path.dirname(SRC_ROOT);
    const outDir = path.join(projectRoot, newDirName);
    await ensureDir(outDir);

    // Find images in this client folder
    const images = await fg(['*.{jpg,jpeg,png,tif,tiff}'], { cwd: clientPath, absolute: true });

    for (const srcFile of images) {
      const base = path.basename(srcFile);
      const name = base.replace(/\.(jpg|jpeg|png|tif|tiff)$/i, '');

      for (const w of sizes) {
        // Determine output filename
        const outName = `${name}-${w}.jpg`;
        const outPath = path.join(outDir, outName);

        try {
          await sharp(srcFile)
            .resize({ width: w, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(outPath);
        } catch (err) {
          console.error(`  Error processing ${base}:`, err.message);
        }
      }
    }
    console.log(`Finished ${clientDirName} -> ${newDirName}: processed ${images.length} images.`);
  })));

  console.log('All done.');
})();