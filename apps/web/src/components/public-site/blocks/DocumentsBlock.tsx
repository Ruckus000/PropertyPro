import type { CommunityTheme } from '@propertypro/theme';
import type { DocumentsBlockContent } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import { documents } from '@propertypro/db';
import { desc, eq } from '@propertypro/db/filters';

interface DocumentsBlockProps {
  content: Record<string, unknown>;
  communityId: number;
  theme: CommunityTheme;
}

/**
 * Documents block — server component that queries documents (optionally filtered
 * by category) and renders them as a list with download-friendly display.
 */
export async function DocumentsBlock({
  content,
  communityId,
  theme,
}: DocumentsBlockProps) {
  const c = content as unknown as DocumentsBlockContent;
  const limit = c.limit ?? 10;
  const title = c.title ?? 'Documents';
  const categoryId = c.categoryId;

  const scoped = createScopedClient(communityId);

  // Build category filter if specified
  const additionalWhere = categoryId
    ? eq(documents.categoryId, categoryId)
    : undefined;

  const rows = await scoped.selectFrom(
    documents,
    {
      id: documents.id,
      title: documents.title,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      fileSize: documents.fileSize,
      createdAt: documents.createdAt,
    },
    additionalWhere,
  );

  const items = await (rows as unknown as { orderBy: (col: ReturnType<typeof desc>) => { limit: (n: number) => Promise<Array<{ id: number; title: string; fileName: string; mimeType: string; fileSize: number; createdAt: Date }>> } })
    .orderBy(desc(documents.createdAt))
    .limit(limit);

  return (
    <section className="w-full py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h2
          className="text-2xl font-bold mb-6"
          style={{
            color: theme.primaryColor,
            fontFamily: `'${theme.fontHeading}', sans-serif`,
          }}
        >
          {title}
        </h2>
        {items.length === 0 ? (
          <p className="text-gray-500">No documents available.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex-shrink-0 text-gray-400" aria-hidden="true">
                    {getFileIcon(item.mimeType)}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="font-medium text-gray-900 truncate"
                      style={{ fontFamily: `'${theme.fontBody}', sans-serif` }}
                    >
                      {item.title}
                    </p>
                    <p className="text-sm text-gray-500">
                      {item.fileName} &middot; {formatFileSize(item.fileSize)}
                    </p>
                  </div>
                </div>
                <time className="text-sm text-gray-500 flex-shrink-0 ml-4">
                  {item.createdAt.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function getFileIcon(mimeType: string): string {
  if (mimeType.includes('pdf')) return '\u{1F4C4}';
  if (mimeType.includes('image')) return '\u{1F5BC}';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '\u{1F4CA}';
  return '\u{1F4CE}';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
