'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Badge } from '@propertypro/ui';
import { DocumentUploader } from '@/components/documents/document-uploader';
import type { StatutoryStepData } from '@/lib/onboarding/condo-wizard-types';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';

interface DocumentCategory {
    id: number;
    slug: string;
    name: string;
}

function normalizeCategorySlug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

interface StatutoryDocumentsStepProps {
    communityId: number;
    communityType: string;
    onNext: (data: StatutoryStepData) => void;
    initialData?: StatutoryStepData;
}

export function StatutoryDocumentsStep({
    communityId,
    communityType,
    onNext,
    initialData,
}: StatutoryDocumentsStepProps) {
    const [items, setItems] = useState<ChecklistItemData[]>([]);
    const [categories, setCategories] = useState<DocumentCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [nextError, setNextError] = useState<string | null>(null);

    // Map of templateKey -> documentId (uploaded so far)
    const [uploadedDocs, setUploadedDocs] = useState<Record<string, number>>({});

    useEffect(() => {
        let mounted = true;

        async function initialize() {
            try {
                setLoading(true);
                setLoadError(null);

                // 1. Ensure checklist items are generated
                const postRes = await fetch('/api/v1/compliance', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ communityId, communityType }),
                });
                if (!postRes.ok) {
                    throw new Error('Failed to initialize compliance checklist');
                }

                // 2. Fetch checklist items
                const getRes = await fetch(`/api/v1/compliance?communityId=${communityId}`);
                if (!getRes.ok) {
                    throw new Error('Failed to load compliance checklist');
                }
                const json = (await getRes.json()) as { data: ChecklistItemData[] };

                // 3. Fetch system document categories to map category string -> id
                const catRes = await fetch(`/api/v1/document-categories?communityId=${communityId}`);
                if (!catRes.ok) {
                    throw new Error('Failed to load document categories');
                }
                const catJson = (await catRes.json()) as { data: DocumentCategory[] };

                if (mounted) {
                    setItems(json.data ?? []);
                    setCategories(catJson.data ?? []);

                    if (initialData?.items) {
                        const initialMap: Record<string, number> = {};
                        for (const item of initialData.items) {
                            initialMap[item.templateKey] = item.documentId;
                        }
                        setUploadedDocs(initialMap);
                    }
                }
            } catch (err) {
                if (mounted) {
                    setLoadError(err instanceof Error ? err.message : String(err));
                }
            } finally {
                if (mounted) setLoading(false);
            }
        }

        initialize();

        return () => {
            mounted = false;
        };
    }, [communityId, communityType, initialData]);

    // We only require them to upload documents that have a 'deadline' indicating statutory requirement,
    // or maybe all generated items are statutory. Let's show all items, but mark them as required.
    const requiredItems = items;

    function handleDocumentUploaded(templateKey: string, doc: Record<string, unknown>) {
        const docId = Number(doc.id);
        if (!Number.isFinite(docId)) return;

        setNextError(null);
        setUploadedDocs((prev) => ({
            ...prev,
            [templateKey]: docId,
        }));
    }

    function handleNext() {
        setNextError(null);
        // Transform map to the StatutoryStepData format
        const statutoryItems: StatutoryStepData['items'] = [];
        const unresolvedCategories = new Set<string>();

        for (const [tKey, dId] of Object.entries(uploadedDocs)) {
            // Find the corresponding categoryId
            const item = items.find((i) => i.templateKey === tKey);
            if (!item) continue;

            const normalizedCategory = normalizeCategorySlug(item.category);
            const matchedCat = categories.find((c) => c.slug === normalizedCategory);
            if (!matchedCat) {
                unresolvedCategories.add(item.category);
                continue;
            }

            statutoryItems.push({
                templateKey: tKey,
                documentId: dId,
                categoryId: matchedCat.id,
            });
        }

        if (unresolvedCategories.size > 0) {
            setNextError(
                `Could not map one or more checklist categories (${Array.from(unresolvedCategories).join(', ')}). Please contact support before continuing.`,
            );
            return;
        }

        onNext({ items: statutoryItems });
    }

    const allUploaded = requiredItems.length > 0 && requiredItems.every((item) => uploadedDocs[item.templateKey] !== undefined || item.documentId !== null);

    if (loading) {
        return <div className="py-8 text-center text-sm text-[var(--text-secondary)]">Loading compliance requirements...</div>;
    }

    if (loadError) {
        return <div className="py-8 text-center text-sm text-red-600">{loadError}</div>;
    }

    if (requiredItems.length === 0) {
        return (
            <div className="space-y-6">
                <p className="text-sm text-gray-700">No statutory documents are required for your community type at this time.</p>
                <div className="flex justify-end">
                    <Button onClick={handleNext}>Continue</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-lg font-semibold text-gray-900">Statutory Documents</h2>
                <p className="mt-1 text-sm text-gray-600">
                    Upload required legal and governing documents for your community. These documents populate your compliance dashboard and will be made available to residents based on your state's laws.
                </p>
            </div>

            <div className="space-y-6">
                {requiredItems.map((item) => {
                    const isUploaded = uploadedDocs[item.templateKey] !== undefined || item.documentId !== null;

                    return (
                        <Card key={item.templateKey} className={isUploaded ? 'border-green-200 bg-green-50' : ''}>
                            <Card.Header>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <Card.Title>{item.title}</Card.Title>
                                        {isUploaded && <Badge variant="success">Uploaded</Badge>}
                                    </div>
                                    <Card.Subtitle>
                                        <span className="mr-3 text-[var(--text-tertiary)]">Required by: {item.statuteReference || 'Statutory Code'}</span>
                                    </Card.Subtitle>
                                </div>
                            </Card.Header>
                            <Card.Body>
                                {item.description && (
                                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
                                )}

                                {!isUploaded ? (
                                    <DocumentUploader
                                        communityId={communityId}
                                        onUploaded={(doc) => handleDocumentUploaded(item.templateKey, doc)}
                                    />
                                ) : (
                                    <div className="text-sm text-green-700">
                                        Document successfully linked to your compliance checklist.
                                    </div>
                                )}
                            </Card.Body>
                        </Card>
                    );
                })}
            </div>

            <div className="flex items-center justify-between border-t pt-6">
                <p className="text-sm text-gray-500">
                    {!allUploaded ? 'You can upload required documents later from the Compliance Dashboard.' : 'All set!'}
                </p>
                <div className="flex flex-col items-end gap-2">
                    {nextError && <p className="max-w-sm text-right text-xs text-red-600">{nextError}</p>}
                    <Button onClick={handleNext}>
                        {allUploaded ? 'Continue' : 'Skip remaining & Continue'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
