/**
 * Locates an installed package directory from the repo root.
 *
 * Some packages hide "./package.json" behind their `exports` map, which breaks
 * require.resolve(name + "/package.json"). Fall back to resolving the main
 * entry and walking up to the directory whose package.json carries the name.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export function resolvePkgDir(name, repoRoot) {
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    /* fall through */
  }
  try {
    let dir = path.dirname(require.resolve(name));
    while (dir !== path.dirname(dir)) {
      const manifest = path.join(dir, "package.json");
      if (existsSync(manifest)) {
        try {
          if (JSON.parse(readFileSync(manifest, "utf8")).name === name) return dir;
        } catch {
          /* unreadable manifest — keep walking */
        }
      }
      dir = path.dirname(dir);
    }
  } catch {
    /* fall through */
  }
  const plain = path.join(repoRoot, "node_modules", ...name.split("/"));
  return existsSync(plain) ? plain : null;
}

export function readVersion(pkgDir) {
  try {
    return JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
}
