export function splitList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function pick<T>(items: T[], index: number): T {
  return items[Math.abs(index) % items.length];
}

export function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function sanitizeWords(text: string, avoidWords: string[]): string {
  return avoidWords.reduce((current, word) => {
    const normalizedWord = word.trim().replace(/^[^\w]+|[^\w]+$/g, '');
    if (!normalizedWord) return current;
    const escaped = normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return current.replace(new RegExp(`(^|\\W)(${escaped})(?=\\W|$)`, 'gi'), '$1[kept private]');
  }, text);
}

export function sentenceJoin(items: string[], fallback: string): string {
  if (items.length === 0) return fallback;
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
