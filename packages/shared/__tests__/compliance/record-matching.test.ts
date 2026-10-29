/**
 * Record-matching rules: which posted document can fill which Florida record.
 *
 * A wrong link is worse than no link, because the checklist would then show a
 * record as posted when it is not. So besides what must match there are cases for
 * what must NOT: the category gate, a file name that fits two items, and the
 * insurance items, which take anything filed as insurance and nothing outside it.
 */
import { describe, it, expect } from 'vitest';
import {
  RECORD_MATCH_RULES,
  matchingTemplateKeys,
  proposeTemplateKeyForFile,
  type MatchableDocument,
  type RecordMatchRule,
} from '../../src/compliance/record-matching';
import { getComplianceTemplate } from '../../src/compliance/templates';
import {
  KNOWN_DOCUMENT_CATEGORY_KEYS,
  type DocumentCategoryKey,
} from '../../src/document-categories';
import * as shared from '../../src/index';

const condoKeys = getComplianceTemplate('condo_718').map((item) => item.templateKey);
const hoaKeys = getComplianceTemplate('hoa_720').map((item) => item.templateKey);

/** A document whose file name is its title plus ".pdf", unless told otherwise. */
const doc = (
  title: string,
  categoryKey: DocumentCategoryKey,
  fileName = `${title}.pdf`,
): MatchableDocument => ({ title, fileName, categoryKey });

interface Sample {
  key: string;
  title: string;
  categoryKey: DocumentCategoryKey;
}

/**
 * What a board volunteer would actually call each record. A key with two
 * categories gets a row per category, so both are exercised.
 */
const SAMPLES: readonly Sample[] = [
  // Condominium, chapter 718
  { key: '718_declaration', title: 'Declaration of Condominium', categoryKey: 'declaration' },
  { key: '718_bylaws', title: 'Amended and Restated Bylaws', categoryKey: 'declaration' },
  { key: '718_articles', title: 'Articles of Incorporation', categoryKey: 'declaration' },
  { key: '718_rules', title: 'Rules and Regulations', categoryKey: 'rules' },
  { key: '718_rules', title: 'House Rules', categoryKey: 'declaration' },
  { key: '718_qa_sheet', title: 'Question and Answer Sheet', categoryKey: 'declaration' },
  { key: '718_qa_sheet', title: 'Q&A Sheet', categoryKey: 'declaration' },
  { key: '718_budget', title: '2026 Annual Budget', categoryKey: 'financial_records' },
  { key: '718_financial_report', title: 'Annual Financial Report 2025', categoryKey: 'financial_records' },
  { key: '718_financial_report', title: 'Audited Financial Statements 2025', categoryKey: 'financial_records' },
  { key: '718_minutes_rolling_12m', title: 'Board Meeting Minutes March 2026', categoryKey: 'meeting_minutes' },
  { key: '718_video_recordings', title: 'Board Meeting Recording March 2026', categoryKey: 'meeting_minutes' },
  { key: '718_meeting_notices', title: 'Notice of Annual Meeting', categoryKey: 'meeting_minutes' },
  { key: '718_affidavits', title: 'Officer Affidavit 2026', categoryKey: 'meeting_minutes' },
  { key: '718_affidavits', title: 'Director Affidavit 2026', categoryKey: 'declaration' },
  { key: '718_insurance', title: 'Master Property Policy', categoryKey: 'insurance' },
  { key: '718_contracts', title: 'List of Executory Contracts', categoryKey: 'contracts' },
  { key: '718_conflict_contracts', title: 'Conflict of Interest Disclosure', categoryKey: 'contracts' },
  { key: '718_bids', title: 'Roof Replacement Bids', categoryKey: 'contracts' },
  { key: '718_inspection_reports', title: 'Milestone Inspection Report 2025', categoryKey: 'inspection_reports' },
  { key: '718_sirs', title: 'Structural Integrity Reserve Study', categoryKey: 'inspection_reports' },
  // Homeowners' association, chapter 720
  { key: '720_governing_docs', title: 'Declaration of Covenants, Conditions and Restrictions', categoryKey: 'declaration' },
  { key: '720_articles', title: 'Articles of Incorporation', categoryKey: 'declaration' },
  { key: '720_bylaws_rules', title: 'Bylaws', categoryKey: 'declaration' },
  { key: '720_bylaws_rules', title: 'Rules and Regulations', categoryKey: 'rules' },
  { key: '720_budget', title: '2026 Budget', categoryKey: 'financial_records' },
  { key: '720_financial_report', title: 'Annual Financial Statement', categoryKey: 'financial_records' },
  { key: '720_minutes_rolling_12m', title: 'Minutes of Board Meeting', categoryKey: 'meeting_minutes' },
  { key: '720_meeting_notices', title: 'Meeting Agenda', categoryKey: 'meeting_minutes' },
  { key: '720_insurance', title: 'Liability Insurance Certificate', categoryKey: 'insurance' },
  { key: '720_contracts', title: 'Landscaping Contract', categoryKey: 'contracts' },
  { key: '720_bids', title: 'Pool Resurfacing Bids', categoryKey: 'contracts' },
];

const keysFor = (templateKey: string): string[] => (templateKey.startsWith('718_') ? condoKeys : hoaKeys);

/**
 * Titles and file names as they are really written, with separators where the
 * patterns expect spaces. Each row is read three ways below: as a title, as a file
 * name, and as the bare file name handed to proposeTemplateKeyForFile.
 */
const SEPARATED: ReadonlyArray<[text: string, categoryKey: DocumentCategoryKey, key: string]> = [
  // "_" is a word character, so \bbudget\b cannot see the word in this one as typed.
  ['2025_budget.xlsx', 'financial_records', '718_budget'],
  // financial\s+report needs whitespace; hyphens are not whitespace.
  ['2025-financial-report.pdf', 'financial_records', '718_financial_report'],
  ['board_meeting_minutes_2026-03.pdf', 'meeting_minutes', '718_minutes_rolling_12m'],
  ['Rules.and.Regulations.docx', 'rules', '718_rules'],
  ['Reserve_Study_2026.pdf', 'inspection_reports', '718_sirs'],
  ['List_of_Executory_Contracts.pdf', 'contracts', '718_contracts'],
  // A run of separators is ONE space: nine characters would overrun question.{0,6}answer.
  ['Question___and___Answer_Sheet.pdf', 'declaration', '718_qa_sheet'],
  // A hyphenated spelling reads as typed and as the space it folds to.
  ['By-Laws.pdf', 'declaration', '718_bylaws'],
];

/**
 * How a board writes "bylaws" in a file name. The first two read before the patterns
 * accepted a space between "by" and "laws"; the rest need it, either as typed ("By Laws")
 * or once a separator folds to one ("By_Laws", "By.Laws", "By-Laws_2019").
 */
const BYLAWS_SPELLINGS: readonly string[] = [
  'Bylaws.pdf',
  'By-Laws.pdf',
  'By Laws.pdf',
  'By_Laws.pdf',
  'By.Laws.pdf',
  'By-Laws_2019.pdf',
];

describe('RECORD_MATCH_RULES', () => {
  it('every template key in templates.ts has a rule', () => {
    const withoutRule = [...condoKeys, ...hoaKeys].filter(
      (key) => !Object.prototype.hasOwnProperty.call(RECORD_MATCH_RULES, key),
    );
    expect(withoutRule).toEqual([]);
  });

  it('has a rule for the template keys and for no others', () => {
    // A rule for a key no template carries is dead weight that would never match.
    expect(Object.keys(RECORD_MATCH_RULES).sort()).toEqual([...condoKeys, ...hoaKeys].sort());
  });

  it('names only known document categories, and at least one', () => {
    for (const [key, rule] of Object.entries(RECORD_MATCH_RULES)) {
      expect(rule.categoryKeys.length, key).toBeGreaterThan(0);
      for (const category of rule.categoryKeys) {
        expect(KNOWN_DOCUMENT_CATEGORY_KEYS, key).toContain(category);
      }
    }
  });

  it('uses the i flag and nothing else, so no pattern keeps match state between calls', () => {
    // A g or y flag makes .test() resume from lastIndex, so the same question gets a
    // different answer on alternate calls.
    for (const [key, rule] of Object.entries(RECORD_MATCH_RULES)) {
      expect(rule.title.flags, key).toBe('i');
    }
  });

  it('answers the same every time it is asked about the same text', () => {
    // Asked of the pattern itself: through the two functions a stateful pattern can hide,
    // because the folded copy gives it a second chance at the text it just failed.
    for (const { key, title } of SAMPLES) {
      const rule = RECORD_MATCH_RULES[key];
      expect(rule, key).toBeDefined();
      expect([1, 2, 3].map(() => rule?.title.test(title)), `${key}: ${title}`).toEqual([true, true, true]);
    }
  });

  it('gives both insurance items the one any-title pattern', () => {
    const anyTitle = RECORD_MATCH_RULES['718_insurance']?.title;
    expect(anyTitle).toBeInstanceOf(RegExp);
    expect(RECORD_MATCH_RULES['720_insurance']?.title).toBe(anyTitle);
  });
});

describe('matchingTemplateKeys', () => {
  describe('each condo and HOA key matches a realistic title', () => {
    it.each(SAMPLES)('$key matches $title filed under $categoryKey', ({ key, title, categoryKey }) => {
      // Exactly that item among all the items of its community type. A realistic
      // title that also fit a second item would make the row useless as evidence.
      expect(matchingTemplateKeys(doc(title, categoryKey), keysFor(key))).toEqual([key]);
    });

    it('has a realistic title for every condo and HOA key', () => {
      const covered = new Set(SAMPLES.map((sample) => sample.key));
      expect([...condoKeys, ...hoaKeys].filter((key) => !covered.has(key))).toEqual([]);
    });
  });

  describe('the title or the file name', () => {
    it('reads the title when the file name says nothing', () => {
      const document = doc('2026 Annual Budget', 'financial_records', 'scan0042.pdf');
      expect(matchingTemplateKeys(document, condoKeys)).toEqual(['718_budget']);
    });

    it('reads the file name when the title says nothing', () => {
      const document = doc('Scan 0042', 'financial_records', 'Annual-Budget-2026.pdf');
      expect(matchingTemplateKeys(document, condoKeys)).toEqual(['718_budget']);
    });

    it('matches nothing when neither says what the document is', () => {
      expect(matchingTemplateKeys(doc('Scan 0042', 'financial_records', 'scan0042.pdf'), condoKeys)).toEqual([]);
    });
  });

  describe('the category', () => {
    it('a budget title in the insurance category matches nothing', () => {
      const budgetInInsurance = doc('2026 Annual Budget', 'insurance');
      // The budget items take financial records only.
      expect(matchingTemplateKeys(budgetInInsurance, ['718_budget', '720_budget'])).toEqual([]);
      // The insurance item takes any title filed as insurance, so once it is a
      // candidate it is the only match.
      expect(matchingTemplateKeys(budgetInInsurance, condoKeys)).toEqual(['718_insurance']);
    });

    const outsideTheirCategory: Array<[title: string, categoryKey: DocumentCategoryKey]> = [
      ['Bylaws', 'financial_records'],
      ['2026 Annual Budget', 'declaration'],
      ['Board Meeting Minutes March 2026', 'rules'],
      ['Board Meeting Minutes March 2026', 'unknown'],
    ];
    it.each(outsideTheirCategory)('"%s" filed under %s matches nothing', (title, categoryKey) => {
      expect(matchingTemplateKeys(doc(title, categoryKey), condoKeys)).toEqual([]);
    });
  });

  describe('the insurance items', () => {
    it.each(['Flood Policy 2026', 'Certificate of Coverage', '2026 Annual Budget', 'Scan 0042'])(
      'an insurance document titled "%s" matches the insurance item',
      (title) => {
        expect(matchingTemplateKeys(doc(title, 'insurance'), condoKeys)).toEqual(['718_insurance']);
        expect(matchingTemplateKeys(doc(title, 'insurance'), hoaKeys)).toEqual(['720_insurance']);
      },
    );

    it('are not matched by an insurance title outside the insurance category', () => {
      expect(matchingTemplateKeys(doc('Insurance Policy 2026', 'contracts'), condoKeys)).toEqual([]);
      expect(matchingTemplateKeys(doc('Insurance Policy 2026', 'declaration'), hoaKeys)).toEqual([]);
    });
  });

  describe('a name that fits two items', () => {
    it("'Declaration and Bylaws.pdf' returns two keys (ambiguous)", () => {
      const both = doc('Declaration and Bylaws', 'declaration', 'Declaration and Bylaws.pdf');
      expect(matchingTemplateKeys(both, condoKeys)).toEqual(['718_declaration', '718_bylaws']);
      expect(matchingTemplateKeys(both, hoaKeys)).toEqual(['720_governing_docs', '720_bylaws_rules']);
    });
  });

  describe('two documents for one item', () => {
    it('gives a 2025 budget and a 2026 budget the same key, and does not prefer a year', () => {
      // The rules judge one document at a time. With two documents for one item it is the
      // caller that must notice there are two candidates and link neither of them.
      expect(matchingTemplateKeys(doc('2025 Annual Budget', 'financial_records'), condoKeys)).toEqual(['718_budget']);
      expect(matchingTemplateKeys(doc('2026 Annual Budget', 'financial_records'), condoKeys)).toEqual(['718_budget']);
    });
  });

  describe('separators in the title and the file name', () => {
    // The other text carries no evidence, so only the row under test can match.
    it.each(SEPARATED)('"%s" is read as a title', (text, categoryKey, key) => {
      expect(matchingTemplateKeys(doc(text, categoryKey, 'scan0042.pdf'), condoKeys)).toEqual([key]);
    });

    it.each(SEPARATED)('"%s" is read as a file name', (text, categoryKey, key) => {
      expect(matchingTemplateKeys(doc('Scan 0042', categoryKey, text), condoKeys)).toEqual([key]);
    });
  });

  describe('the text as typed and as folded', () => {
    // Every shipped pattern reads a folded name at least as well as a typed one, so each half
    // of the reading is pinned with a throwaway rule. The table is restored afterwards.
    const table = RECORD_MATCH_RULES as Record<string, RecordMatchRule>;
    const withRule = (key: string, title: RegExp, run: () => void) => {
      table[key] = { categoryKeys: ['declaration'], title };
      try {
        run();
      } finally {
        delete table[key];
      }
    };

    it('reads the text as typed, for a pattern that needs the separator', () => {
      withRule('test_needs_hyphen', /\ba-b\b/i, () => {
        const typed = doc('a-b', 'declaration', 'scan0042.pdf');
        expect(matchingTemplateKeys(typed, ['test_needs_hyphen'])).toEqual(['test_needs_hyphen']);
        expect(proposeTemplateKeyForFile('a-b.pdf', ['test_needs_hyphen'])).toBe('test_needs_hyphen');
      });
    });

    it('reads the folded text, for a pattern that needs the space', () => {
      withRule('test_needs_space', /\ba b\b/i, () => {
        const separated = doc('a_b', 'declaration', 'scan0042.pdf');
        expect(matchingTemplateKeys(separated, ['test_needs_space'])).toEqual(['test_needs_space']);
        expect(proposeTemplateKeyForFile('a.b.pdf', ['test_needs_space'])).toBe('test_needs_space');
      });
    });

    it('leaves the rule table as it found it', () => {
      expect(Object.keys(RECORD_MATCH_RULES).sort()).toEqual([...condoKeys, ...hoaKeys].sort());
    });
  });

  describe('meeting records named in the plural', () => {
    const meetingRecords: Array<[title: string, key: string]> = [
      ['Meeting Notices', '718_meeting_notices'],
      ['Meeting Notice', '718_meeting_notices'],
      ['Meeting Agendas', '718_meeting_notices'],
      ['Meeting Agenda', '718_meeting_notices'],
      ['Board Meeting Recordings', '718_video_recordings'],
      ['Board Meeting Recording', '718_video_recordings'],
      ['Meeting Videos', '718_video_recordings'],
      ['Meeting Video', '718_video_recordings'],
    ];
    it.each(meetingRecords)('"%s" filed as meeting minutes matches %s', (title, key) => {
      expect(matchingTemplateKeys(doc(title, 'meeting_minutes'), condoKeys)).toEqual([key]);
    });

    it("'Meeting Notices.pdf' filed as meeting minutes matches 718_meeting_notices", () => {
      const notices = doc('Scan 0042', 'meeting_minutes', 'Meeting Notices.pdf');
      expect(matchingTemplateKeys(notices, condoKeys)).toEqual(['718_meeting_notices']);
    });

    it('an HOA notice or agenda matches 720_meeting_notices in the plural too', () => {
      expect(matchingTemplateKeys(doc('Meeting Notices', 'meeting_minutes'), hoaKeys)).toEqual(['720_meeting_notices']);
      expect(matchingTemplateKeys(doc('Meeting Agendas', 'meeting_minutes'), hoaKeys)).toEqual(['720_meeting_notices']);
    });
  });

  describe('the candidate keys', () => {
    const both = doc('Declaration and Bylaws', 'declaration');

    it('are the only keys considered', () => {
      expect(matchingTemplateKeys(both, ['718_bylaws'])).toEqual(['718_bylaws']);
      expect(matchingTemplateKeys(both, ['718_budget', '718_bylaws'])).toEqual(['718_bylaws']);
      expect(matchingTemplateKeys(both, [])).toEqual([]);
    });

    it('decide the order of the result, not the order of the rule table', () => {
      expect(matchingTemplateKeys(both, ['718_declaration', '718_bylaws'])).toEqual(['718_declaration', '718_bylaws']);
      expect(matchingTemplateKeys(both, ['718_bylaws', '718_declaration'])).toEqual(['718_bylaws', '718_declaration']);
    });

    it('skip a key with no rule, without complaint', () => {
      expect(matchingTemplateKeys(both, ['custom_pool_permit', '718_bylaws'])).toEqual(['718_bylaws']);
      // Names every object inherits are not rules either, and must not throw.
      expect(
        matchingTemplateKeys(both, ['constructor', '__proto__', 'toString', 'hasOwnProperty', '718_bylaws']),
      ).toEqual(['718_bylaws']);
    });
  });
});

describe('proposeTemplateKeyForFile', () => {
  it("proposeTemplateKeyForFile('2025-financial-report.pdf', condoKeys) is 718_financial_report", () => {
    expect(proposeTemplateKeyForFile('2025-financial-report.pdf', condoKeys)).toBe('718_financial_report');
  });

  it('proposes the item of the community type it is given', () => {
    expect(proposeTemplateKeyForFile('2025-financial-report.pdf', hoaKeys)).toBe('720_financial_report');
  });

  it('proposes nothing when the name says nothing', () => {
    expect(proposeTemplateKeyForFile('scan0042.pdf', condoKeys)).toBeNull();
    expect(proposeTemplateKeyForFile('', condoKeys)).toBeNull();
  });

  it('proposes nothing when the name fits more than one item', () => {
    expect(proposeTemplateKeyForFile('Declaration and Bylaws.pdf', condoKeys)).toBeNull();
    expect(proposeTemplateKeyForFile('Declaration and Bylaws.pdf', hoaKeys)).toBeNull();
    expect(proposeTemplateKeyForFile('2025-budget.pdf', ['720_budget', '718_budget'])).toBeNull();
  });

  it('proposes only among the candidate keys', () => {
    expect(proposeTemplateKeyForFile('2025-budget.pdf', ['718_bylaws'])).toBeNull();
    expect(proposeTemplateKeyForFile('2025-budget.pdf', [])).toBeNull();
    expect(proposeTemplateKeyForFile('2025-budget.pdf', ['718_bylaws', '720_budget'])).toBe('720_budget');
  });

  it('skips a key with no rule, without complaint', () => {
    expect(proposeTemplateKeyForFile('2025-budget.pdf', ['custom_pool_permit', '718_budget'])).toBe('718_budget');
    expect(
      proposeTemplateKeyForFile('2025-budget.pdf', ['constructor', '__proto__', 'toString', '718_budget']),
    ).toBe('718_budget');
  });

  it('never proposes an insurance item, because a file name is no evidence for it', () => {
    // The insurance items would otherwise match every name too.
    expect(proposeTemplateKeyForFile('2025-insurance-policy.pdf', condoKeys)).toBeNull();
    expect(proposeTemplateKeyForFile('2025-insurance-policy.pdf', hoaKeys)).toBeNull();
    expect(proposeTemplateKeyForFile('anything.pdf', ['718_insurance', '720_insurance'])).toBeNull();
  });

  describe('separators in the file name', () => {
    const fileNames = SEPARATED.map(([text, , key]): [string, string] => [text, key]);
    it.each(fileNames)('"%s" proposes %s', (fileName, key) => {
      expect(proposeTemplateKeyForFile(fileName, condoKeys)).toBe(key);
    });
  });
});

describe('spellings of "bylaws" in a file name', () => {
  // The title carries no evidence, so only the file name can match.
  const neutralTitle = 'Scan 0042';

  it.each(BYLAWS_SPELLINGS)('"%s" is the condo bylaws item', (fileName) => {
    expect(matchingTemplateKeys(doc(neutralTitle, 'declaration', fileName), condoKeys)).toEqual(['718_bylaws']);
  });

  it.each(BYLAWS_SPELLINGS)('"%s" is the HOA bylaws and rules item', (fileName) => {
    expect(matchingTemplateKeys(doc(neutralTitle, 'declaration', fileName), hoaKeys)).toEqual(['720_bylaws_rules']);
  });

  it.each(BYLAWS_SPELLINGS)('"%s" is proposed as the condo bylaws item', (fileName) => {
    expect(proposeTemplateKeyForFile(fileName, condoKeys)).toBe('718_bylaws');
  });

  it.each(BYLAWS_SPELLINGS)('"%s" is proposed as the HOA bylaws and rules item', (fileName) => {
    expect(proposeTemplateKeyForFile(fileName, hoaKeys)).toBe('720_bylaws_rules');
  });
});

describe('package entry point', () => {
  it('re-exports the rules and both functions', () => {
    expect(shared.RECORD_MATCH_RULES).toBe(RECORD_MATCH_RULES);
    expect(shared.matchingTemplateKeys).toBe(matchingTemplateKeys);
    expect(shared.proposeTemplateKeyForFile).toBe(proposeTemplateKeyForFile);
  });
});
