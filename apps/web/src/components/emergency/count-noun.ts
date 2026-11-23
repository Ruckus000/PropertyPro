/** "1 recipient", "0 recipients", "2 recipients": a count with the noun that agrees with it. */
export function countNoun(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const recipientCountText = (n: number): string => countNoun(n, 'recipient', 'recipients');
