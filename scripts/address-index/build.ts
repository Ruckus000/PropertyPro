import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import {
  buildCompactAddressRecord,
  buildRecordDedupeKey,
  buildShardPlan,
  getAddressShardPrefix,
  getHouseDigitBucket,
  mapCsvRow,
} from './lib';

const NAD_RELEASE_URL = 'https://data.transportation.gov/download/fc2s-wawr/application/x-zip-compressed';
const OUTPUT_DIR = path.resolve(process.cwd(), 'apps/web/public/address-autocomplete/v1');
const MAX_SHARD_RECORDS = 5000;
const MIN_STREET_TOKEN_LENGTH = 4;

type BuildOptions = {
  outputDir: string;
  sourcePath: string | null;
  maxRecords: number | null;
};

function parseArgs(argv: string[]): BuildOptions {
  let outputDir = OUTPUT_DIR;
  let sourcePath: string | null = null;
  let maxRecords: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--output' && next) {
      outputDir = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === '--source' && next) {
      sourcePath = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === '--max-records' && next) {
      maxRecords = Number.parseInt(next, 10);
      index += 1;
    }
  }

  return { outputDir, sourcePath, maxRecords };
}

function ensureCommand(command: string): void {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
  if (result.status !== 0) {
    throw new Error(`Required command "${command}" is not available in PATH.`);
  }
}

async function downloadSourceZip(targetPath: string): Promise<void> {
  console.log(`Downloading pinned NAD release to ${targetPath}`);
  const response = await fetch(NAD_RELEASE_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download NAD release: ${response.status} ${response.statusText}`);
  }

  const readable = Readable.fromWeb(response.body);
  const writable = createWriteStream(targetPath);
  readable.pipe(writable);
  await finished(writable);
}

function openSourceStream(sourcePath: string) {
  if (sourcePath.endsWith('.zip')) {
    const unzip = spawn('unzip', ['-p', sourcePath], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    if (!unzip.stdout) {
      throw new Error('Failed to read zipped NAD source.');
    }

    return unzip.stdout;
  }

  return createReadStream(sourcePath, { encoding: 'utf8' });
}

async function buildRawIndexFile(
  sourcePath: string,
  rawOutputPath: string,
  maxRecords: number | null,
): Promise<{ processedRows: number; emittedRecords: number }> {
  const input = openSourceStream(sourcePath);
  const output = createWriteStream(rawOutputPath, { encoding: 'utf8' });
  const reader = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });

  let columns: string[] | null = null;
  let processedRows = 0;
  let emittedRecords = 0;

  try {
    for await (const line of reader) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      if (!columns) {
        columns = trimmed.split(',').map((column) => column.replace(/^\ufeff/, '').trim());
        continue;
      }

      processedRows += 1;
      const row = mapCsvRow(columns, line);
      const record = buildCompactAddressRecord(row);
      if (!record) {
        continue;
      }

      const prefix = getAddressShardPrefix(record.a, MIN_STREET_TOKEN_LENGTH);
      if (!prefix) {
        continue;
      }

      const lineToWrite = [
        prefix,
        getHouseDigitBucket(record),
        buildRecordDedupeKey(record),
        JSON.stringify(record),
      ].join('\t');

      output.write(`${lineToWrite}\n`);
      emittedRecords += 1;

      if (maxRecords && emittedRecords >= maxRecords) {
        break;
      }
    }
  } finally {
    reader.close();
    output.end();
    await finished(output);
  }

  return { processedRows, emittedRecords };
}

async function sortAndDedupeRawIndex(rawPath: string, sortedPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const sort = spawn('sort', ['-t', '\t', '-k1,1', '-k3,3', '-u', rawPath, '-o', sortedPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    sort.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`sort exited with status ${code ?? 'unknown'}`));
    });

    sort.on('error', reject);
  });
}

async function writeShardFiles(sortedPath: string, outputDir: string) {
  mkdirSync(outputDir, { recursive: true });
  for (const file of readdirSync(outputDir)) {
    if (file.startsWith('shard-') && file.endsWith('.json')) {
      rmSync(path.join(outputDir, file));
    }
  }

  const manifestPrefixes: Record<string, string[]> = {};
  let totalRecords = 0;

  const reader = readline.createInterface({
    input: createReadStream(sortedPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let currentPrefix: string | null = null;
  let currentRecords: Array<ReturnType<typeof JSON.parse>> = [];

  async function flushCurrentPrefix(): Promise<void> {
    if (!currentPrefix || currentRecords.length === 0) {
      return;
    }

    const shardPlan = buildShardPlan(currentPrefix, currentRecords, MAX_SHARD_RECORDS);
    manifestPrefixes[currentPrefix] = shardPlan.shardIds;

    for (const [shardId, shardRecords] of Object.entries(shardPlan.shardFiles)) {
      await writeFile(
        path.join(outputDir, `${shardId}.json`),
        JSON.stringify(shardRecords),
        'utf8',
      );
      totalRecords += shardRecords.length;
    }

    currentPrefix = null;
    currentRecords = [];
  }

  try {
    for await (const line of reader) {
      if (!line.trim()) {
        continue;
      }

      const firstTab = line.indexOf('\t');
      const secondTab = line.indexOf('\t', firstTab + 1);
      const thirdTab = line.indexOf('\t', secondTab + 1);

      if (firstTab === -1 || secondTab === -1 || thirdTab === -1) {
        continue;
      }

      const prefix = line.slice(0, firstTab);
      const payload = line.slice(thirdTab + 1);

      if (currentPrefix && currentPrefix !== prefix) {
        await flushCurrentPrefix();
      }

      currentPrefix = prefix;
      currentRecords.push(JSON.parse(payload));
    }

    await flushCurrentPrefix();
  } finally {
    reader.close();
  }

  return {
    prefixes: manifestPrefixes,
    totalRecords,
  };
}

async function main(): Promise<void> {
  ensureCommand('sort');
  ensureCommand('unzip');

  const options = parseArgs(process.argv.slice(2));
  const tempDir = await mkdtemp(path.join(tmpdir(), 'propertypro-address-index-'));
  const rawIndexPath = path.join(tempDir, 'raw-index.tsv');
  const sortedIndexPath = path.join(tempDir, 'sorted-index.tsv');

  let sourcePath = options.sourcePath;

  try {
    if (!sourcePath) {
      sourcePath = path.join(tempDir, 'nad.zip');
      await downloadSourceZip(sourcePath);
    } else if (!existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    console.log(`Building raw address index from ${sourcePath}`);
    const ingestionSummary = await buildRawIndexFile(sourcePath, rawIndexPath, options.maxRecords);
    console.log(`Processed ${ingestionSummary.processedRows} rows and emitted ${ingestionSummary.emittedRecords} candidate records`);

    console.log('Sorting and deduplicating candidate records');
    await sortAndDedupeRawIndex(rawIndexPath, sortedIndexPath);

    console.log(`Writing shard files to ${options.outputDir}`);
    const shardSummary = await writeShardFiles(sortedIndexPath, options.outputDir);

    const manifest = {
      version: 1 as const,
      builtAt: new Date().toISOString(),
      dataset: {
        name: 'USDOT National Address Database',
        url: NAD_RELEASE_URL,
        sizeBytes: 8452531826,
      },
      shardPrefixLength: MIN_STREET_TOKEN_LENGTH,
      minStreetTokenLength: MIN_STREET_TOKEN_LENGTH,
      maxShardRecords: MAX_SHARD_RECORDS,
      prefixes: shardSummary.prefixes,
      totalRecords: shardSummary.totalRecords,
    };

    await writeFile(
      path.join(options.outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );

    console.log(`Wrote ${Object.keys(shardSummary.prefixes).length} manifest prefixes and ${shardSummary.totalRecords} shard records`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
