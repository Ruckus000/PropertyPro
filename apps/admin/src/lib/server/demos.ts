import { listDemos, type DemoInstanceRow } from '@/lib/db/demo-queries';

export type DemoListRow = DemoInstanceRow;

export async function getDemoListData(): Promise<DemoListRow[]> {
  const { data, error } = await listDemos();

  if (error) {
    throw new Error(`Failed to load demos: ${error.message}`);
  }

  return data ?? [];
}
