import { describe, it, expect } from 'vitest';
import { BLOCK_TYPES, blockSchemaRegistry } from '../../src/site-blocks/index';

describe('blockSchemaRegistry', () => {
  it('has an entry for every BlockType', () => {
    for (const blockType of BLOCK_TYPES) {
      expect(blockSchemaRegistry[blockType]).toBeDefined();
    }
  });

  it('has no extra entries beyond BlockType', () => {
    const registryKeys = Object.keys(blockSchemaRegistry);
    expect(registryKeys.sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it('each registry entry is a valid Zod schema (has safeParse)', () => {
    for (const blockType of BLOCK_TYPES) {
      const schema = blockSchemaRegistry[blockType];
      expect(typeof schema.safeParse).toBe('function');
    }
  });
});
