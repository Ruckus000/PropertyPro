import type { LedgerEntryRow } from '@propertypro/db';
import type { AccountingProvider } from '@propertypro/db';

export interface AccountingMappingOption {
  category: string;
  externalAccountId: string;
  externalAccountName: string;
}

export interface AccountingExportEntry {
  ledgerEntry: LedgerEntryRow;
  mappedAccountId: string;
}

export interface AccountingExportResult {
  exportedCount: number;
  providerReference: string;
}

export interface AccountingProviderAdapter {
  readonly provider: AccountingProvider;
  buildConnectUrl(params: {
    communityId: number;
    userId: string;
    state: string;
    redirectUri: string;
  }): string;
  exchangeCodeForTokens(params: {
    code: string;
    redirectUri: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    tenantId: string;
  }>;
  discoverMappings(params: {
    tenantId: string;
  }): Promise<AccountingMappingOption[]>;
  exportEntries(params: {
    tenantId: string;
    entries: readonly AccountingExportEntry[];
  }): Promise<AccountingExportResult>;
  disconnect(params: { tenantId: string }): Promise<void>;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function buildDeterministicToken(prefix: string, seed: string): string {
  return `${prefix}_${stableHash(seed)}`;
}

function buildBaseConnectUrl(provider: AccountingProvider, params: {
  communityId: number;
  userId: string;
  state: string;
  redirectUri: string;
}): string {
  const url = new URL(`https://oauth.${provider}.example/connect`);
  url.searchParams.set('state', params.state);
  url.searchParams.set('communityId', String(params.communityId));
  url.searchParams.set('userId', params.userId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  return url.toString();
}

function buildProviderAdapter(
  provider: AccountingProvider,
  mappings: readonly AccountingMappingOption[],
): AccountingProviderAdapter {
  return {
    provider,
    buildConnectUrl(params) {
      return buildBaseConnectUrl(provider, params);
    },
    async exchangeCodeForTokens(params) {
      const tokenSeed = `${provider}:${params.code}:${params.redirectUri}`;
      return {
        accessToken: buildDeterministicToken(`${provider}_access`, tokenSeed),
        refreshToken: buildDeterministicToken(`${provider}_refresh`, tokenSeed),
        tenantId: buildDeterministicToken(`${provider}_tenant`, tokenSeed),
      };
    },
    async discoverMappings() {
      return [...mappings];
    },
    async exportEntries(params) {
      const idSeed = `${provider}:${params.tenantId}:${params.entries.length}`;
      return {
        exportedCount: params.entries.length,
        providerReference: `${provider}_batch_${stableHash(idSeed)}`,
      };
    },
    async disconnect() {
      return;
    },
  };
}

const QUICKBOOKS_MAPPINGS: readonly AccountingMappingOption[] = [
  {
    category: 'assessment',
    externalAccountId: 'qbo-income-assessment',
    externalAccountName: 'Assessment Income',
  },
  {
    category: 'payment',
    externalAccountId: 'qbo-cash-operating',
    externalAccountName: 'Operating Cash',
  },
  {
    category: 'fine',
    externalAccountId: 'qbo-income-fines',
    externalAccountName: 'Fine Income',
  },
];

const XERO_MAPPINGS: readonly AccountingMappingOption[] = [
  {
    category: 'assessment',
    externalAccountId: 'xero-income-assessment',
    externalAccountName: 'Assessment Revenue',
  },
  {
    category: 'payment',
    externalAccountId: 'xero-bank-operating',
    externalAccountName: 'Operating Bank',
  },
  {
    category: 'fine',
    externalAccountId: 'xero-income-fines',
    externalAccountName: 'Fine Revenue',
  },
];

const ADAPTERS: Record<AccountingProvider, AccountingProviderAdapter> = {
  quickbooks: buildProviderAdapter('quickbooks', QUICKBOOKS_MAPPINGS),
  xero: buildProviderAdapter('xero', XERO_MAPPINGS),
};

export function getAccountingAdapter(provider: AccountingProvider): AccountingProviderAdapter {
  return ADAPTERS[provider];
}
