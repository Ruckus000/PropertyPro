/**
 * Record-matching rules: which posted document can fill which Florida record.
 *
 * A wrong link is worse than no link, because the checklist would then show a
 * record as posted when it is not. So besides what must match there are cases for
 * what must NOT: the category gate, a file name that fits two items, the insurance
 * items (which take anything filed as insurance and nothing outside it), and the
 * papers that merely talk about a record: committee minutes, drafts, solicitations.
 */
import { describe, it, expect } from 'vitest';
import {
  RECORD_MATCH_RULES,
  matchingTemplateKeys,
  proposeTemplateKeyForFile,
  type MatchableDocument,
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
  // Reads as typed and as the space it folds to.
  ['By-Laws.pdf', 'declaration', '718_bylaws'],
  // One hyphenated bylaw: only the text as typed has the hyphen that by-?laws? reads. Folded it is
  // "By Law", and the spaced form needs the plural.
  ['By-Law.pdf', 'declaration', '718_bylaws'],
];

/**
 * How a board writes "bylaws" in a file name. The first two need no space; the rest need the
 * spaced form "By Laws", either as typed or once a separator folds to one ("By_Laws", "By.Laws",
 * "By-Laws_2019").
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
    // different answer on alternate calls. That holds for a veto as much as for a title.
    for (const [key, rule] of Object.entries(RECORD_MATCH_RULES)) {
      expect(rule.title.flags, key).toBe('i');
      if (rule.exclude !== undefined) expect(rule.exclude.flags, `${key} veto`).toBe('i');
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

  describe('the vetoes', () => {
    // Which items share which veto, by key. The patterns themselves are checked against the ruling
    // by scripts, not restated here; what these pin is the assignment and the sharing.
    const VETO_GROUPS: Record<string, readonly string[]> = {
      'governing document': [
        '718_declaration', '718_bylaws', '718_articles', '720_articles',
        '718_rules', '718_qa_sheet', '720_governing_docs', '720_bylaws_rules',
      ],
      budget: ['718_budget', '720_budget'],
      'financial report': ['718_financial_report', '720_financial_report'],
      minutes: ['718_minutes_rolling_12m', '720_minutes_rolling_12m'],
      bids: ['718_bids', '720_bids'],
      insurance: ['718_insurance', '720_insurance'],
      inspection: ['718_inspection_reports', '718_sirs'],
      'conflict of interest': ['718_conflict_contracts'],
      recording: ['718_video_recordings'],
    };

    it.each(Object.entries(VETO_GROUPS))('the %s items share one veto', (_group, keys) => {
      const first = RECORD_MATCH_RULES[keys[0] ?? '']?.exclude;
      expect(first, keys.join(', ')).toBeInstanceOf(RegExp);
      for (const key of keys) expect(RECORD_MATCH_RULES[key]?.exclude, key).toBe(first);
    });

    it('gives each group a veto of its own', () => {
      const vetoes = Object.values(VETO_GROUPS).map((keys) => RECORD_MATCH_RULES[keys[0] ?? '']?.exclude);
      expect(new Set(vetoes).size).toBe(Object.keys(VETO_GROUPS).length);
    });

    it('puts every item that has a veto in a group, and no other', () => {
      const withVeto = Object.entries(RECORD_MATCH_RULES)
        .filter(([, rule]) => rule.exclude !== undefined)
        .map(([key]) => key);
      expect(withVeto.sort()).toEqual(Object.values(VETO_GROUPS).flat().sort());
    });

    it('gives no veto to the meeting notices, the affidavits or the contracts items', () => {
      // A notice or an agenda is what the meeting-notice items are, and an affidavit of mailing a notice is
      // a real affidavit. The chapter 720 contracts item is narrowed to whole words instead.
      for (const key of ['718_meeting_notices', '720_meeting_notices', '718_affidavits', '718_contracts', '720_contracts']) {
        expect(RECORD_MATCH_RULES[key]?.exclude, key).toBeUndefined();
      }
    });
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

describe('"by law" in a file name', () => {
  const neutralTitle = 'Scan 0042';

  // The phrase "by law" and the word "Standby" are not a bylaws file, and a wrong automatic link is
  // worse than a missed one. What each name is proposed as instead is part of the row (null: nothing
  // fits): "Notice by law" is a meeting notice by its first word.
  const notBylaws: ReadonlyArray<{ fileName: string; condo: string | null; hoa: string | null }> = [
    { fileName: 'Required by Law.pdf', condo: null, hoa: null },
    { fileName: 'Notice by law.pdf', condo: '718_meeting_notices', hoa: '720_meeting_notices' },
    { fileName: 'Standby Laws.pdf', condo: null, hoa: null },
  ];

  it.each(notBylaws)('$fileName does not match the condo bylaws item', ({ fileName }) => {
    expect(matchingTemplateKeys(doc(neutralTitle, 'declaration', fileName), condoKeys)).toEqual([]);
  });

  it.each(notBylaws)('$fileName does not match the HOA bylaws and rules item', ({ fileName }) => {
    expect(matchingTemplateKeys(doc(neutralTitle, 'declaration', fileName), hoaKeys)).toEqual([]);
  });

  it.each(notBylaws)('$fileName is not proposed as the condo bylaws item', ({ fileName, condo }) => {
    expect(proposeTemplateKeyForFile(fileName, condoKeys)).toBe(condo);
  });

  it.each(notBylaws)('$fileName is not proposed as the HOA bylaws and rules item', ({ fileName, hoa }) => {
    expect(proposeTemplateKeyForFile(fileName, hoaKeys)).toBe(hoa);
  });

  it('accepts the plural phrase, which cannot be told from the spelling "By Laws"', () => {
    // "Required By Laws of Florida" says the same two words as "By Laws.pdf", so it reads as bylaws.
    // The singular phrase above is left out; this one is the cost of reading the spelling.
    const phrase = 'Required By Laws of Florida.pdf';
    expect(matchingTemplateKeys(doc(neutralTitle, 'declaration', phrase), condoKeys)).toEqual(['718_bylaws']);
    expect(matchingTemplateKeys(doc(neutralTitle, 'declaration', phrase), hoaKeys)).toEqual(['720_bylaws_rules']);
    expect(proposeTemplateKeyForFile(phrase, condoKeys)).toBe('718_bylaws');
    expect(proposeTemplateKeyForFile(phrase, hoaKeys)).toBe('720_bylaws_rules');
  });

  it('accepts the hyphenated singular phrase too, because real amendment titles say "By-Law"', () => {
    // A hyphen reads in either number, so "Required-by-Law" is read as "by-Law". Left in on purpose:
    // the spaced "Required by Law" above is not read, and neither is "Required_by_Law".
    const phrase = 'Required-by-Law.pdf';
    expect(matchingTemplateKeys(doc(neutralTitle, 'declaration', phrase), condoKeys)).toEqual(['718_bylaws']);
    expect(matchingTemplateKeys(doc(neutralTitle, 'declaration', phrase), hoaKeys)).toEqual(['720_bylaws_rules']);
    expect(proposeTemplateKeyForFile(phrase, condoKeys)).toBe('718_bylaws');
    expect(proposeTemplateKeyForFile(phrase, hoaKeys)).toBe('720_bylaws_rules');
  });
});

describe('papers about a record are not the record', () => {
  // Each row is a realistic document that shares a record's words without being the record: committee and
  // meeting papers, drafts, solicitations, proposals, invoices. A wrong automatic link is worse than a missed
  // one, so each matches nothing at all, against every item of either community type. Between them the rows
  // exercise the veto of every item that has one.
  const notTheRecord: ReadonlyArray<{ title: string; categoryKey: DocumentCategoryKey }> = [
    // Governing documents: committee and meeting papers
    { title: 'Rules Committee Agenda', categoryKey: 'rules' },
    { title: 'Declaration Review Committee Minutes', categoryKey: 'declaration' },
    { title: 'Bylaws Committee Meeting Notice', categoryKey: 'declaration' },
    { title: 'Notice of Proposed Articles Amendment', categoryKey: 'declaration' },
    { title: 'Q&A Session Notice', categoryKey: 'declaration' },
    // The budget and its working papers
    { title: 'Budget Meeting Notice', categoryKey: 'financial_records' },
    { title: 'Budget Meeting Minutes', categoryKey: 'financial_records' },
    { title: 'Notice of Budget Workshop', categoryKey: 'financial_records' },
    { title: 'Budget vs Actual - December 2025', categoryKey: 'financial_records' },
    // The financial report, and the paperwork around an audit
    { title: 'Audit Committee Minutes', categoryKey: 'financial_records' },
    { title: 'Waiver of Financial Reporting Ballot', categoryKey: 'financial_records' },
    { title: 'Audit Engagement Letter 2025', categoryKey: 'financial_records' },
    // Minutes that are not yet the approved record, and a receipt for a recording
    { title: 'DRAFT Board Meeting Minutes - Not Yet Approved', categoryKey: 'meeting_minutes' },
    { title: 'Unapproved Minutes', categoryKey: 'meeting_minutes' },
    { title: 'Proposed Meeting Minutes', categoryKey: 'meeting_minutes' },
    { title: 'Meeting Recording Receipt', categoryKey: 'meeting_minutes' },
    // Solicitations are not the bids received
    { title: 'Invitation to Bid', categoryKey: 'contracts' },
    { title: 'Request for Bids', categoryKey: 'contracts' },
    { title: 'Bid Opening Notice', categoryKey: 'contracts' },
    // A policy about conflicts is not a contract that creates one, nor a contractor's certificate a contract
    { title: 'Conflict of Interest Policy', categoryKey: 'contracts' },
    { title: 'Contractor Insurance Certificate', categoryKey: 'contracts' },
    { title: 'Landscaping Contractor Licence', categoryKey: 'contracts' },
    // What leads to an inspection or a study is not its report
    { title: 'Reserve Study Proposal', categoryKey: 'inspection_reports' },
    { title: 'Milestone Inspection Proposal', categoryKey: 'inspection_reports' },
    // Insurance is decided by category alone: bills, claims and quotes in that folder are not the policy
    { title: 'Insurance Premium Invoice', categoryKey: 'insurance' },
    { title: 'Insurance Claim - Hurricane Ian', categoryKey: 'insurance' },
    { title: 'Insurance Renewal Quote', categoryKey: 'insurance' },
    { title: 'Insurance Committee Minutes', categoryKey: 'insurance' },
  ];

  it.each(notTheRecord)('$title filed under $categoryKey matches nothing', ({ title, categoryKey }) => {
    expect(matchingTemplateKeys(doc(title, categoryKey), condoKeys)).toEqual([]);
    expect(matchingTemplateKeys(doc(title, categoryKey), hoaKeys)).toEqual([]);
  });

  it('Recording-Receipt.pdf proposes null, while Recording.pdf is the recording', () => {
    expect(proposeTemplateKeyForFile('Recording.pdf', condoKeys)).toBe('718_video_recordings');
    expect(proposeTemplateKeyForFile('Recording-Receipt.pdf', condoKeys)).toBeNull();
    expect(proposeTemplateKeyForFile('Recording-Receipt.pdf', hoaKeys)).toBeNull();
  });

  it('Draft-Minutes-March.pdf proposes null, while Minutes-March.pdf is the minutes', () => {
    expect(proposeTemplateKeyForFile('Minutes-March.pdf', condoKeys)).toBe('718_minutes_rolling_12m');
    expect(proposeTemplateKeyForFile('Minutes-March.pdf', hoaKeys)).toBe('720_minutes_rolling_12m');
    expect(proposeTemplateKeyForFile('Draft-Minutes-March.pdf', condoKeys)).toBeNull();
    expect(proposeTemplateKeyForFile('Draft-Minutes-March.pdf', hoaKeys)).toBeNull();
  });

  it('a veto word in the file name vetoes a document whose title is clean', () => {
    const clean = doc('2026 Budget', 'financial_records', '2026-budget.pdf');
    const workshop = doc('2026 Budget', 'financial_records', '2026-budget-workshop-notice.pdf');
    expect(matchingTemplateKeys(clean, condoKeys)).toEqual(['718_budget']);
    expect(matchingTemplateKeys(clean, hoaKeys)).toEqual(['720_budget']);
    expect(matchingTemplateKeys(workshop, condoKeys)).toEqual([]);
    expect(matchingTemplateKeys(workshop, hoaKeys)).toEqual([]);
  });

  it('a veto word in the title vetoes a document whose file name is clean', () => {
    const notice = doc('2026 Budget Workshop Notice', 'financial_records', '2026-budget.pdf');
    expect(matchingTemplateKeys(notice, condoKeys)).toEqual([]);
    expect(matchingTemplateKeys(notice, hoaKeys)).toEqual([]);
  });

  it('a veto word that only the folded name shows still vetoes', () => {
    // "_Workshop" has no word boundary as typed; folded it is "Workshop". The first name is the control.
    const plain = doc('Scan 0042', 'financial_records', 'Budget 2026.pdf');
    const joined = doc('Scan 0042', 'financial_records', 'Budget 2026_Workshop.pdf');
    expect(matchingTemplateKeys(plain, condoKeys)).toEqual(['718_budget']);
    expect(matchingTemplateKeys(joined, condoKeys)).toEqual([]);
    expect(proposeTemplateKeyForFile('Budget 2026.pdf', condoKeys)).toBe('718_budget');
    expect(proposeTemplateKeyForFile('Budget 2026_Workshop.pdf', condoKeys)).toBeNull();
  });

  it('still reads an affidavit of mailing a notice as an affidavit', () => {
    // Why the affidavits take no veto: this one names a notice and is still the record.
    expect(matchingTemplateKeys(doc('Affidavit of Mailing of Notice', 'declaration'), condoKeys)).toEqual(['718_affidavits']);
  });

  it('the chapter 720 contracts item reads a contract as a whole word, singular or plural', () => {
    expect(matchingTemplateKeys(doc('Landscaping Contract', 'contracts'), hoaKeys)).toEqual(['720_contracts']);
    expect(matchingTemplateKeys(doc('Landscaping Contracts', 'contracts'), hoaKeys)).toEqual(['720_contracts']);
  });
});

describe('package entry point', () => {
  it('re-exports the rules and both functions', () => {
    expect(shared.RECORD_MATCH_RULES).toBe(RECORD_MATCH_RULES);
    expect(shared.matchingTemplateKeys).toBe(matchingTemplateKeys);
    expect(shared.proposeTemplateKeyForFile).toBe(proposeTemplateKeyForFile);
  });
});
