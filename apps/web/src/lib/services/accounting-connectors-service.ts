import {
  accountingConnections,
  createScopedClient,
  decryptToken,
  encryptToken,
  listLedgerEntries,
  logAuditEvent,
  type AccountingConnection,
  type AccountingProvider,
  type LedgerEntryRow,
} from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { NotFoundError } from '@/lib/api/errors';
import {
  getAccountingAdapter,
  type AccountingMappingOption,
} from '@/lib/accounting/adapters';

interface AccountingConnectionRow extends AccountingConnection {
  [key: string]: unknown;
}

function getAccountingCallbackUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    return `${appUrl.replace(/\/$/, '')}/api/v1/accounting/callback`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}/api/v1/accounting/callback`;
  }

  return 'http://localhost:3000/api/v1/accounting/callback';
}

function serializeState(
  communityId: number,
  userId: string,
  provider: AccountingProvider,
): string {
  return Buffer.from(
    JSON.stringify({
      communityId,
      userId,
      provider,
      ts: Date.now(),
    }),
  ).toString('base64url');
}

function normalizeMappingConfig(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, raw]) => typeof raw === 'string' && raw.trim().length > 0)
    .map(([key, raw]) => [key, (raw as string).trim()]);

  return Object.fromEntries(entries);
}

async function getConnectionOrThrow(
  communityId: number,
  provider: AccountingProvider,
): Promise<AccountingConnectionRow> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<AccountingConnectionRow>(
    accountingConnections,
    {},
    eq(accountingConnections.provider, provider),
  );
  const connection = rows[0];
  if (!connection) {
    throw new NotFoundError(`No ${provider} accounting connection configured`);
  }
  return connection;
}

export async function initiateAccountingConnect(
  communityId: number,
  actorUserId: string,
  provider: AccountingProvider,
): Promise<{ authorizationUrl: string; state: string }> {
  const adapter = getAccountingAdapter(provider);
  const state = serializeState(communityId, actorUserId, provider);

  return {
    authorizationUrl: adapter.buildConnectUrl({
      communityId,
      userId: actorUserId,
      state,
      redirectUri: getAccountingCallbackUrl(),
    }),
    state,
  };
}

export async function completeAccountingConnect(
  communityId: number,
  actorUserId: string,
  provider: AccountingProvider,
  code: string,
  requestId?: string | null,
): Promise<{
  provider: AccountingProvider;
  tenantId: string;
}> {
  const scoped = createScopedClient(communityId);
  const adapter = getAccountingAdapter(provider);
  const tokenPayload = await adapter.exchangeCodeForTokens({
    code,
    redirectUri: getAccountingCallbackUrl(),
  });

  const existingRows = await scoped.selectFrom<AccountingConnectionRow>(
    accountingConnections,
    {},
    eq(accountingConnections.provider, provider),
  );
  const existing = existingRows[0];

  if (existing) {
    await scoped.update(
      accountingConnections,
      {
        accessToken: encryptToken(tokenPayload.accessToken),
        refreshToken: encryptToken(tokenPayload.refreshToken),
        tenantId: tokenPayload.tenantId,
      },
      eq(accountingConnections.id, existing.id),
    );

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'accounting_connection',
      resourceId: String(existing.id),
      communityId,
      metadata: {
        requestId: requestId ?? null,
        provider,
      },
    });

    return {
      provider,
      tenantId: tokenPayload.tenantId,
    };
  }

  const [created] = await scoped.insert(accountingConnections, {
    provider,
    accessToken: encryptToken(tokenPayload.accessToken),
    refreshToken: encryptToken(tokenPayload.refreshToken),
    tenantId: tokenPayload.tenantId,
  });

  const createdId = created?.['id'];
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'accounting_connection',
    resourceId: typeof createdId === 'number' ? String(createdId) : 'unknown',
    communityId,
    metadata: {
      requestId: requestId ?? null,
      provider,
    },
  });

  return {
    provider,
    tenantId: tokenPayload.tenantId,
  };
}

export async function getAccountingMapping(
  communityId: number,
  provider: AccountingProvider,
): Promise<{
  provider: AccountingProvider;
  mapping: Record<string, string>;
  discoveredAccounts: AccountingMappingOption[];
}> {
  const connection = await getConnectionOrThrow(communityId, provider);
  const adapter = getAccountingAdapter(provider);

  const discoveredAccounts = await adapter.discoverMappings({
    tenantId: connection.tenantId,
  });

  return {
    provider,
    mapping: normalizeMappingConfig(connection.mappingConfig),
    discoveredAccounts,
  };
}

export async function updateAccountingMapping(
  communityId: number,
  actorUserId: string,
  provider: AccountingProvider,
  mapping: Record<string, string>,
  requestId?: string | null,
): Promise<{
  provider: AccountingProvider;
  mapping: Record<string, string>;
}> {
  const scoped = createScopedClient(communityId);
  const connection = await getConnectionOrThrow(communityId, provider);

  const normalized = normalizeMappingConfig(mapping);

  await scoped.update(
    accountingConnections,
    {
      mappingConfig: normalized,
    },
    eq(accountingConnections.id, connection.id),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'accounting_connection',
    resourceId: String(connection.id),
    communityId,
    metadata: {
      requestId: requestId ?? null,
      provider,
      mappingKeys: Object.keys(normalized),
    },
  });

  return {
    provider,
    mapping: normalized,
  };
}

function toCategoryKey(entry: LedgerEntryRow): string {
  return String(entry.entryType);
}

export async function exportLedgerToAccounting(
  communityId: number,
  actorUserId: string,
  provider: AccountingProvider,
  options: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  },
  requestId?: string | null,
): Promise<{
  provider: AccountingProvider;
  exportedCount: number;
  skippedCount: number;
  warnings: string[];
  providerReference: string | null;
}> {
  const scoped = createScopedClient(communityId);
  const connection = await getConnectionOrThrow(communityId, provider);
  const adapter = getAccountingAdapter(provider);

  const ledgerRows = await listLedgerEntries(scoped, {
    startDate: options.startDate,
    endDate: options.endDate,
    limit: options.limit ?? 500,
  });

  const mapping = normalizeMappingConfig(connection.mappingConfig);

  const warnings: string[] = [];
  const mappedEntries = ledgerRows.flatMap((entry) => {
    const categoryKey = toCategoryKey(entry);
    const mappedAccountId = mapping[categoryKey];
    if (!mappedAccountId) {
      warnings.push(
        `Skipped ledger entry ${entry.id}: no account mapping for category "${categoryKey}"`,
      );
      return [];
    }

    return [{
      ledgerEntry: entry,
      mappedAccountId,
    }];
  });

  let providerReference: string | null = null;
  if (mappedEntries.length > 0) {
    const accessToken = decryptToken(connection.accessToken);
    const refreshToken = decryptToken(connection.refreshToken);

    const result = await adapter.exportEntries({
      tenantId: connection.tenantId,
      entries: mappedEntries,
    });

    providerReference = result.providerReference;

    await scoped.update(
      accountingConnections,
      {
        lastSyncAt: new Date(),
        // Persist latest encrypted token material in case refresh happened in adapter.
        accessToken: encryptToken(accessToken),
        refreshToken: encryptToken(refreshToken),
      },
      eq(accountingConnections.id, connection.id),
    );
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'accounting_connection',
    resourceId: String(connection.id),
    communityId,
    metadata: {
      requestId: requestId ?? null,
      provider,
      exportedCount: mappedEntries.length,
      skippedCount: warnings.length,
      providerReference,
    },
  });

  return {
    provider,
    exportedCount: mappedEntries.length,
    skippedCount: warnings.length,
    warnings,
    providerReference,
  };
}

export async function disconnectAccounting(
  communityId: number,
  actorUserId: string,
  provider: AccountingProvider,
  requestId?: string | null,
): Promise<{ disconnected: boolean }> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<AccountingConnectionRow>(
    accountingConnections,
    {},
    eq(accountingConnections.provider, provider),
  );
  const connection = rows[0];

  if (!connection) {
    return { disconnected: true };
  }

  const adapter = getAccountingAdapter(provider);
  await adapter.disconnect({ tenantId: connection.tenantId });

  await scoped.hardDelete(
    accountingConnections,
    and(
      eq(accountingConnections.id, connection.id),
      eq(accountingConnections.provider, provider),
    ),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'accounting_connection',
    resourceId: String(connection.id),
    communityId,
    metadata: {
      requestId: requestId ?? null,
      provider,
    },
  });

  return { disconnected: true };
}
