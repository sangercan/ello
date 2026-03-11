import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const tasks = [
  { from: resolve(root, 'ello-web', 'android'), to: resolve(root, 'android') },
  { from: resolve(root, 'ello-web', 'ios'), to: resolve(root, 'ios') },
  { from: resolve(root, 'ello-web', 'dist'), to: resolve(root, 'dist') },
  // Capacitor config can be generated from .ts after `npx cap sync`.
  { from: resolve(root, 'ello-web', 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json'), to: resolve(root, 'capacitor.config.json') },
  // Fallback for projects that still keep capacitor.config.json at web root.
  { from: resolve(root, 'ello-web', 'capacitor.config.json'), to: resolve(root, 'capacitor.config.json'), optional: true },
];

for (const { from, to, optional } of tasks) {
  if (!existsSync(from)) {
    if (!optional) {
      console.warn(`[appflow-prepare-root] missing: ${from}`);
    }
    continue;
  }

  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`[appflow-prepare-root] copied ${from} -> ${to}`);
}
