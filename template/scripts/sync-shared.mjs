#!/usr/bin/env node
/**
 * shared 同步入口的薄壳。
 *
 * 真身是 `src/shared/scripts/sync-shared.mjs`（随 shared 一起升级，跟着 VERSION 走）。
 * 这里留一个稳定路径，是为了让「每个站点都跑 `node scripts/sync-shared.mjs --check`」
 * 这条约定不随 shared 内部结构调整而变化。
 *
 *   node scripts/sync-shared.mjs --check
 *   node scripts/sync-shared.mjs --to 1.1.0 [--dry-run]
 */
import "../src/shared/scripts/sync-shared.mjs";
