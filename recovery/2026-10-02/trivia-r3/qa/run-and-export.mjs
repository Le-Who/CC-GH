/** Explicit user-run companion. Never installed as a watcher or scheduled task. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as runner from './run-qa.mjs';
import { exportArchive, validateExportDestination } from './export-artifacts.mjs';

export function parseCompanionArguments(args) {
  const qaArgs = [], options = { outputDir: null, allowSync: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output-dir') {
      if (options.outputDir !== null) throw new Error('Duplicate --output-dir');
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing value after --output-dir');
      options.outputDir = value;
    } else if (args[i] === '--allow-sync') {
      if (options.allowSync) throw new Error('Duplicate --allow-sync');
      options.allowSync = true;
    } else qaArgs.push(args[i]);
  }
  return { ...runner.parseArguments(qaArgs), ...options };
}

/** Dependency seam allows unit coverage without launching a real browser. */
export async function runAndExport(options, dependencies = {}) {
  const runQA = dependencies.runQA ?? runner.run;
  const copyQA = dependencies.copyQA ?? exportArchive;
  const artifactVersion = dependencies.artifactVersion ?? runner.LOCAL_ARTIFACTS_SCHEMA_VERSION;
  const root = path.resolve(options.root);
  const { outputDir, allowSync, ...qaOptions } = options;
  if (outputDir && !allowSync) throw new Error('--output-dir also requires --allow-sync because its sync client may upload the report');
  if (allowSync && !outputDir) throw new Error('--allow-sync requires an explicit existing --output-dir');
  if (outputDir) {
    if (artifactVersion !== 1) throw new Error('This QA runner lacks the exact archive-path contract. Use the complete matching companion kit; no latest-ZIP fallback is permitted');
    await validateExportDestination(root, outputDir);
  }
  const qa = await runQA({ ...qaOptions, root });
  if (!outputDir) return { qaStatus: qa.status, exportStatus: 'disabled', exitCode: qa.status === 'passed' ? 0 : 1 };
  const archive = qa.localArtifacts?.archivePath;
  if (!archive || !path.isAbsolute(archive)) {
    return { qaStatus: qa.status, exportStatus: 'failed', exitCode: 2, error: 'This run did not produce an exact completed ZIP path. Reports remain local; no other archive was selected' };
  }
  try {
    const exported = await copyQA({ root, archive, outputDir, allowSync: true });
    return { qaStatus: qa.status, exportStatus: exported.status, exitCode: qa.status === 'passed' ? 0 : 1, exported };
  } catch (error) {
    return { qaStatus: qa.status, exportStatus: 'failed', exitCode: 2, error: error.message };
  }
}

function help() {
  console.log(`CC-GH local QA with OPTIONAL explicit export\n\nLocal QA only (default, no copying):\n  node qa/run-and-export.mjs --root "ABSOLUTE_PREVIEW_ROOT" --quick\n\nRun QA, then copy THIS run's ZIP into the chosen sync folder:\n  node qa/run-and-export.mjs --root "ABSOLUTE_PREVIEW_ROOT" --game merge --quick --output-dir "EXISTING_ABSOLUTE_SYNC_FOLDER" --allow-sync\n\nOther QA options: --full, --game auto|all|garden|merge|bubbo|trivia, --case NAME, --browser PATH\nNo schedule, watcher, credentials, new folders, or direct network upload.\nCopy failures preserve the source report; cloud sync must be verified separately.\nExit 0: QA passed, optional local export succeeded. 1: QA not passed (may still export diagnostics). 2: setup/export error.\nSee DRIVE-AUTOMATION.md.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCompanionArguments(process.argv.slice(2));
    if (options.help) help();
    else {
      const result = await runAndExport(options);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.exitCode;
    }
  } catch (error) {
    console.error(`QA companion failed: ${error.message}`);
    process.exitCode = 2;
  }
}
