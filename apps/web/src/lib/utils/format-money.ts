/** A stored decimal amount of dollars as money: `"1500.00"` → `"$1,500.00"`; nothing → an em dash. */
export function formatMoney(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
