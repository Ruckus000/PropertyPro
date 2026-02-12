import { describe, it, expect } from 'vitest';
import { validateResidentCsv } from '../../src/lib/utils/csv-validator';

describe('csv-validator (P1-19)', () => {
  it('parses commas in quoted fields', () => {
    const csv = 'name,email,role,unit_number\n"Owner, One",owner1@example.com,owner,12';
    const result = validateResidentCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.data.name).toBe('Owner, One');
  });

  it('handles UTF-8 BOM', () => {
    const bom = "\uFEFF";
    const csv = `${bom}name,email,role\nTenant,tenant@example.com,tenant`;
    const result = validateResidentCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]?.data.email).toBe('tenant@example.com');
  });

  it('handles Windows CRLF line endings', () => {
    const csv = 'name,email,role\r\nBoard,board@example.com,board_member\r\n';
    const result = validateResidentCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.data.role).toBe('board_member');
  });

  it('ignores empty rows and trailing commas', () => {
    const csv = 'name,email,role,unit_number,\n\nA,a@example.com,owner,1,\n\nB,b@example.com,tenant,2';
    const result = validateResidentCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.data.unit_number).toBe('1');
  });

  it('detects duplicate email addresses with row numbers', () => {
    const csv = 'name,email,role\nOwner,dup@example.com,owner\nTenant,dup@example.com,tenant';
    const result = validateResidentCsv(csv);
    expect(result.errors).toEqual([
      { rowNumber: 3, column: 'email', message: "Duplicate email 'dup@example.com' in import" },
    ]);
    expect(result.rows).toHaveLength(1);
  });

  it('reports invalid email with correct row number', () => {
    const csv = 'name,email,role\nBad,not-an-email,tenant';
    const result = validateResidentCsv(csv);
    expect(result.errors).toEqual([
      { rowNumber: 2, column: 'email', message: 'Invalid email address' },
    ]);
  });
});

