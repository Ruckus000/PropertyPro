/**
 * Unit tests for CSV export service (P3-53).
 *
 * Tests cover:
 * - Formula-injection sanitization for dangerous leading characters
 * - RFC 4180 quoting and escaping
 * - Full CSV generation with headers and data rows
 */
import { describe, expect, it } from 'vitest';
import { sanitizeCell, escapeCSVField, generateCSV } from '../../src/lib/services/csv-export';

describe('csv-export', () => {
  // -------------------------------------------------------------------------
  // sanitizeCell
  // -------------------------------------------------------------------------

  describe('sanitizeCell', () => {
    it('prefixes = with apostrophe', () => {
      expect(sanitizeCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    });

    it('prefixes + with apostrophe', () => {
      expect(sanitizeCell('+cmd|calc')).toBe("'+cmd|calc");
    });

    it('prefixes - with apostrophe', () => {
      expect(sanitizeCell('-negative')).toBe("'-negative");
    });

    it('prefixes @ with apostrophe', () => {
      expect(sanitizeCell('@import')).toBe("'@import");
    });

    it('prefixes tab with apostrophe', () => {
      expect(sanitizeCell('\tcmd')).toBe("'\tcmd");
    });

    it('prefixes carriage return with apostrophe', () => {
      expect(sanitizeCell('\rcmd')).toBe("'\rcmd");
    });

    it('does not modify safe strings', () => {
      expect(sanitizeCell('Hello World')).toBe('Hello World');
    });

    it('does not modify empty string', () => {
      expect(sanitizeCell('')).toBe('');
    });

    it('does not modify strings starting with numbers', () => {
      expect(sanitizeCell('123.45')).toBe('123.45');
    });

    it('only sanitizes the first character', () => {
      expect(sanitizeCell('normal =formula')).toBe('normal =formula');
    });
  });

  // -------------------------------------------------------------------------
  // escapeCSVField
  // -------------------------------------------------------------------------

  describe('escapeCSVField', () => {
    it('returns empty string for null', () => {
      expect(escapeCSVField(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(escapeCSVField(undefined)).toBe('');
    });

    it('converts numbers to string', () => {
      expect(escapeCSVField(42)).toBe('42');
    });

    it('quotes fields containing commas', () => {
      expect(escapeCSVField('hello, world')).toBe('"hello, world"');
    });

    it('quotes fields containing double quotes and escapes them', () => {
      expect(escapeCSVField('say "hello"')).toBe('"say ""hello"""');
    });

    it('quotes fields containing newlines', () => {
      expect(escapeCSVField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('sanitizes formula injection before quoting', () => {
      // After sanitization: '=HYPERLINK("http://evil.com")
      // Contains double quotes, so must be quoted with escaped doubles per RFC 4180
      expect(escapeCSVField('=HYPERLINK("http://evil.com")')).toBe(
        "\"'=HYPERLINK(\"\"http://evil.com\"\")\"",
      );
    });

    it('sanitizes and quotes when field has both dangerous char and comma', () => {
      expect(escapeCSVField('=SUM(A1,A2)')).toBe("\"'=SUM(A1,A2)\"");
    });
  });

  // -------------------------------------------------------------------------
  // generateCSV
  // -------------------------------------------------------------------------

  describe('generateCSV', () => {
    it('generates CSV with headers and data', () => {
      const headers = [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
      ];
      const rows = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
      ];

      const csv = generateCSV(headers, rows);
      const lines = csv.split('\r\n');

      expect(lines[0]).toBe('ID,Name,Email');
      expect(lines[1]).toBe('1,Alice,alice@example.com');
      expect(lines[2]).toBe('2,Bob,bob@example.com');
    });

    it('handles null values in rows', () => {
      const headers = [
        { key: 'id', label: 'ID' },
        { key: 'notes', label: 'Notes' },
      ];
      const rows = [{ id: 1, notes: null }];

      const csv = generateCSV(headers, rows);
      const lines = csv.split('\r\n');

      expect(lines[1]).toBe('1,');
    });

    it('sanitizes formula injection in data cells', () => {
      const headers = [{ key: 'value', label: 'Value' }];
      const rows = [{ value: '=CMD()' }];

      const csv = generateCSV(headers, rows);
      const lines = csv.split('\r\n');

      expect(lines[1]).toBe("'=CMD()");
    });

    it('ends with CRLF', () => {
      const headers = [{ key: 'id', label: 'ID' }];
      const rows = [{ id: 1 }];

      const csv = generateCSV(headers, rows);
      expect(csv.endsWith('\r\n')).toBe(true);
    });

    it('handles empty rows', () => {
      const headers = [{ key: 'id', label: 'ID' }];
      const csv = generateCSV(headers, []);
      const lines = csv.split('\r\n');

      expect(lines[0]).toBe('ID');
      // Only header + trailing CRLF
      expect(lines.length).toBe(2);
    });
  });
});
