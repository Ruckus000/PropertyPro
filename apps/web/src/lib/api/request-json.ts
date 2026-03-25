export async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = (await response.json()) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(json.error?.message ?? 'Request failed');
  }
  if (json.data === undefined) {
    throw new Error('Missing response payload');
  }
  return json.data;
}
