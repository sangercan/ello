import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const tasks = [
  { from: resolve(root, 'ello-web', 'android'), to: resolve(root, 'android') },
  { from: resolve(root, 'ello-web', 'ios'), to: resolve(root, 'ios') },
  { from: resolve(root, 'ello-web', 'dist'), to: resolve(root, 'dist') },
  { from: resolve(root, 'ello-web', 'capacitor.config.json'), to: resolve(root, 'capacitor.config.json') },
];

for (const { from, to } of tasks) {
  if (!existsSync(from)) {
    console.warn(`[appflow-prepare-root] missing: ${from}`);
    continue;
  }

  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`[appflow-prepare-root] copied ${from} -> ${to}`);
}
