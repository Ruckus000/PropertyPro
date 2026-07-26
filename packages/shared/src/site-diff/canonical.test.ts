import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { TOMBSTONE_BLOCK_TYPE } from '../site-blocks/index';
import { fingerprint, parseSectionContent, stableStringify, zodIssuesToFields } from './canonical';

describe('stableStringify', () => {
  it('is insensitive to key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('drops undefined-valued keys but keeps null', () => {
    // The single most likely source of a phantom diff: zod `.optional()` fields
    // come back absent on one side and explicitly undefined on the other.
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
    expect(stableStringify({ a: null })).not.toBe(stableStringify({}));
  });

  it('treats array order as significant', () => {
    // A gallery's photo order is content, not incidental.
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('sorts nested keys too', () => {
    expect(stableStringify({ o: { x: 1, y: 2 } })).toBe(stableStringify({ o: { y: 2, x: 1 } }));
  });

  it('throws on a cycle rather than looping forever', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic['self'] = cyclic;
    expect(() => stableStringify(cyclic)).toThrow(/cyclic/);
  });

  it('does not treat a repeated (non-cyclic) reference as a cycle', () => {
    const shared = { x: 1 };
    expect(() => stableStringify({ a: shared, b: shared })).not.toThrow();
  });
});

describe('parseSectionContent', () => {
  it('applies schema defaults', () => {
    const parsed = parseSectionContent({ slot: 2, blockType: 'documents', content: {} });
    expect(parsed.degraded).toBe(false);
    expect(parsed.parsed).toMatchObject({ limit: 5 });
  });

  it('flags an unknown block type as degraded instead of throwing', () => {
    const parsed = parseSectionContent({ slot: 2, blockType: 'payments', content: { a: 1 } });
    expect(parsed.degraded).toBe(true);
    expect(parsed.parsed).toEqual({ a: 1 });
  });

  it('flags content that fails its schema as degraded', () => {
    const parsed = parseSectionContent({ slot: 2, blockType: 'text', content: { body: '' } });
    expect(parsed.degraded).toBe(true);
  });

  it('recognises a tombstone', () => {
    const parsed = parseSectionContent({ slot: 2, blockType: TOMBSTONE_BLOCK_TYPE, content: {} });
    expect(parsed.tombstone).toBe(true);
  });
});

describe('fingerprint', () => {
  it('is equal for a row stored without its defaults and one stored with them', () => {
    // The zod-defaults case, stated as an identity rather than a diff outcome.
    const bare = fingerprint({ slot: 2, blockType: 'documents', content: {} });
    const filled = fingerprint({ slot: 2, blockType: 'documents', content: { limit: 5 } });
    expect(bare).toBe(filled);
  });

  it('differs when the block type differs, even for identical content', () => {
    const a = fingerprint({ slot: 2, blockType: 'text', content: { body: 'x' } });
    const b = fingerprint({ slot: 2, blockType: 'amenities', content: { body: 'x' } });
    expect(a).not.toBe(b);
  });

  it('ignores the slot — identity is content, not position', () => {
    // This is what lets a pure reorder be detected as a reorder.
    const a = fingerprint({ slot: 2, blockType: 'text', content: { body: 'x' } });
    const b = fingerprint({ slot: 9, blockType: 'text', content: { body: 'x' } });
    expect(a).toBe(b);
  });

  it('cannot be spoofed by a type name that looks like the separator', () => {
    const a = fingerprint({ slot: 2, blockType: 'text', content: { body: 'x' } });
    const b = fingerprint({ slot: 2, blockType: 'text ', content: { body: 'x' } });
    expect(a).not.toBe(b);
  });
});

describe('zodIssuesToFields', () => {
  const schema = z.object({ a: z.string(), nested: z.object({ b: z.number() }) });

  it('renders dotted paths', () => {
    const result = schema.safeParse({ a: 1, nested: { b: 'x' } });
    expect(result.success).toBe(false);
    const fields = zodIssuesToFields(result.error!);
    expect(fields.map((f) => f.field).sort()).toEqual(['a', 'nested.b']);
  });

  it('prefixes paths when asked', () => {
    const result = schema.safeParse({ a: 1, nested: { b: 2 } });
    const fields = zodIssuesToFields(result.error!, '0.content');
    expect(fields[0]!.field).toBe('0.content.a');
  });

  it('uses the bare prefix when the issue has no path', () => {
    const result = z.string().safeParse(1);
    const fields = zodIssuesToFields(result.error!, 'content');
    expect(fields[0]!.field).toBe('content');
  });
});
