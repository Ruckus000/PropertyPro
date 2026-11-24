/**
 * New and Edit contract on the page kit. The header has Cancel only: the form
 * keeps the one filled button (Save) at its foot. Without `contract` this is
 * the New page.
 */
import type { ComponentProps } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section } from '@propertypro/ui/components/shared/section';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { ContractForm } from './contract-form';

type Props = ComponentProps<typeof ContractForm>;

export function ContractFormPage({ communityId, timeZone, contract }: Props) {
  const cancelHref = contract
    ? `/contracts/${contract.id}?communityId=${communityId}`
    : `/contracts?communityId=${communityId}`;

  return (
    <PageLayout
      template="form"
      header={
        <PageHeader
          title={contract ? 'Edit Contract' : 'New Contract'}
          icon={<FileText />}
          description={
            contract
              ? 'Change the terms, the status or the bidding close time of this contract.'
              : 'Record a vendor agreement: who it is with, what it costs and when it ends.'
          }
          actions={
            <Button asChild variant="outline">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
          }
        />
      }
    >
      <Section className="w-full max-w-4xl">
        <ContractForm communityId={communityId} timeZone={timeZone} contract={contract} />
      </Section>
    </PageLayout>
  );
}
