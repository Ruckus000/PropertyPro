/**
 * Which launch options renderHtmlToPdf hands puppeteer, per branch.
 *
 * Kept out of render-pdf.test.ts on purpose: that file runs the REAL packages,
 * because a mocked `executablePath` is exactly the blind spot that shipped the
 * -min outage. This file asks a different question — what the WIRING passes —
 * which a real launch cannot answer, since renderHtmlToPdf never exposes the
 * browser it started.
 *
 * The production branch is pinned value-for-value so a change aimed at local
 * development cannot move it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { launchMock, executablePathMock } = vi.hoisted(() => ({
  launchMock: vi.fn(),
  executablePathMock: vi.fn(),
}));

const LAMBDA_ARGS = [
  '--single-process',
  '--font-render-hinting=none',
  '--disable-web-security',
  '--no-sandbox',
  '--no-zygote',
  "--headless='shell'",
];

vi.mock('puppeteer-core', () => ({ default: { launch: launchMock } }));
vi.mock('@sparticuz/chromium', () => ({
  default: { args: LAMBDA_ARGS, executablePath: executablePathMock },
}));

import { desktopChromeArgs, hardenChromiumArgs, renderHtmlToPdf } from '@/lib/documents/render-pdf';

type LaunchOptions = { args: string[]; executablePath: string; headless: boolean | 'shell' };

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
let previousPath: string | undefined;

beforeEach(() => {
  previousPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  delete process.env.PUPPETEER_EXECUTABLE_PATH;
  launchMock.mockReset().mockResolvedValue({
    newPage: async () => ({
      setViewport: async () => {},
      emulateMediaType: async () => {},
      setContent: async () => {},
      pdf: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
    }),
    close: async () => {},
  });
  executablePathMock.mockReset().mockResolvedValue('/tmp/chromium');
});

afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  Object.defineProperty(process, 'arch', arch);
  if (previousPath === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
  else process.env.PUPPETEER_EXECUTABLE_PATH = previousPath;
});

function onHost(p: NodeJS.Platform, a: string): void {
  Object.defineProperty(process, 'platform', { ...platform, value: p });
  Object.defineProperty(process, 'arch', { ...arch, value: a });
}

function launched(): LaunchOptions {
  expect(launchMock).toHaveBeenCalledTimes(1);
  return launchMock.mock.calls[0]![0] as LaunchOptions;
}

describe('renderHtmlToPdf launch options', () => {
  it('production (no override, linux/x64): the bundled binary, hardened Lambda args, shell mode', async () => {
    onHost('linux', 'x64');
    await renderHtmlToPdf({ html: '<p>x</p>' });

    const opts = launched();
    expect(opts.executablePath).toBe('/tmp/chromium');
    expect(opts.headless).toBe('shell');
    expect(opts.args).toEqual(hardenChromiumArgs(LAMBDA_ARGS));
  });

  it('a developer Chrome gets desktop args, not the Lambda set that forced single-process mode', async () => {
    onHost('darwin', 'arm64');
    process.env.PUPPETEER_EXECUTABLE_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    await renderHtmlToPdf({ html: '<p>x</p>' });

    const opts = launched();
    expect(opts.executablePath).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    expect(opts.headless).toBe(true);
    expect(opts.args).toEqual(desktopChromeArgs());
    for (const flag of ['--single-process', "--headless='shell'", '--no-zygote']) {
      expect(opts.args, `${flag} must not reach a desktop Chrome`).not.toContain(flag);
    }
    // The bundled binary is never inflated when it is not going to run.
    expect(executablePathMock).not.toHaveBeenCalled();
  });

  it('refuses before inflating or launching on a host the bundled Linux x64 binary cannot run on', async () => {
    onHost('darwin', 'arm64');

    await expect(renderHtmlToPdf({ html: '<p>x</p>' })).rejects.toThrow(
      'is a Linux x64 binary and cannot run on darwin/arm64. Set PUPPETEER_EXECUTABLE_PATH',
    );
    expect(executablePathMock).not.toHaveBeenCalled();
    expect(launchMock).not.toHaveBeenCalled();
  });

  it('refuses on linux/arm64 too — the package ships no arm64 binary', async () => {
    onHost('linux', 'arm64');
    await expect(renderHtmlToPdf({ html: '<p>x</p>' })).rejects.toThrow('cannot run on linux/arm64');
    expect(launchMock).not.toHaveBeenCalled();
  });
});

describe('desktopChromeArgs', () => {
  it('keeps the Chromium sandbox for a normal user', () => {
    expect(desktopChromeArgs(501)).toEqual(['--font-render-hinting=none']);
  });

  it('adds --no-sandbox only as root, where Chrome refuses to start without it', () => {
    expect(desktopChromeArgs(0)).toEqual(['--font-render-hinting=none', '--no-sandbox']);
  });
});
