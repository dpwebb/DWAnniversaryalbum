const DEFAULT_MAX_LINE_CHARS = 56;
const DEFAULT_MAX_LINE_WORDS = 10;

type FormatLyricsOptions = {
  maxLineChars?: number;
  maxLineWords?: number;
};

export function formatLyricsForSuno(lyrics: string, options: FormatLyricsOptions = {}): string {
  const maxLineChars = options.maxLineChars ?? DEFAULT_MAX_LINE_CHARS;
  const maxLineWords = options.maxLineWords ?? DEFAULT_MAX_LINE_WORDS;

  return lyrics
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [''];
      if (isNonSungLyricLine(trimmed)) return [trimmed];
      return splitSingableLine(trimmed, maxLineChars, maxLineWords);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isNonSungLyricLine(line: string): boolean {
  return /^\[.+\]$/.test(line) || /^[A-Za-z][A-Za-z0-9 '&/-]{0,32}:$/.test(line);
}

function splitSingableLine(line: string, maxLineChars: number, maxLineWords: number): string[] {
  const compactLine = line.replace(/\s+/g, ' ').trim();
  if (fitsLine(compactLine, maxLineChars, maxLineWords)) {
    return [compactLine];
  }

  const lines: string[] = [];
  let current = '';

  for (const phrase of splitNaturalPhrases(compactLine, maxLineChars, maxLineWords)) {
    const candidate = joinPhrase(current, phrase);
    if (fitsLine(candidate, maxLineChars, maxLineWords)) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = '';
    }

    if (fitsLine(phrase, maxLineChars, maxLineWords)) {
      current = phrase;
      continue;
    }

    lines.push(...splitByWords(phrase, maxLineChars, maxLineWords));
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function splitNaturalPhrases(line: string, maxLineChars: number, maxLineWords: number): string[] {
  const punctuationPhrases = line.match(/[^,;:!?]+[,;:!?]?/g) ?? [line];

  return punctuationPhrases.flatMap((phrase) => splitPhraseBeforeConnectors(phrase.trim(), maxLineChars, maxLineWords));
}

function splitPhraseBeforeConnectors(phrase: string, maxLineChars: number, maxLineWords: number): string[] {
  if (fitsLine(phrase, maxLineChars, maxLineWords)) {
    return [phrase];
  }

  const pieces: string[] = [];
  let current = '';

  for (const word of phrase.split(/\s+/)) {
    const candidate = joinPhrase(current, word);
    const shouldBreak =
      current.length > maxLineChars * 0.45 &&
      connectorStarts(word) &&
      !fitsLine(candidate, maxLineChars, maxLineWords);

    if (shouldBreak) {
      pieces.push(current);
      current = word;
      continue;
    }

    current = candidate;
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
}

function splitByWords(phrase: string, maxLineChars: number, maxLineWords: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of phrase.split(/\s+/)) {
    const candidate = joinPhrase(current, word);
    if (!current || fitsLine(candidate, maxLineChars, maxLineWords)) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function fitsLine(line: string, maxLineChars: number, maxLineWords: number): boolean {
  return line.length <= maxLineChars && wordCount(line) <= maxLineWords;
}

function wordCount(line: string): number {
  return line.split(/\s+/).filter(Boolean).length;
}

function joinPhrase(left: string, right: string): string {
  return left ? `${left} ${right}` : right;
}

function connectorStarts(word: string): boolean {
  return /^(and|but|because|when|where|while|then|with|without|through|before|after|until|if|like|that|who|which)\b/i.test(
    word,
  );
}
