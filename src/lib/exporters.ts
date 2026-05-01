import type { AlbumInputs, AlbumPlan, SongPlan } from '../types';

export function albumToMarkdown(inputs: AlbumInputs, album: AlbumPlan): string {
  return [
    `# ${album.title}`,
    '',
    `**For:** ${inputs.wifeName || 'Robbin'}`,
    `**From:** ${inputs.myName || ''}`,
    `**Anniversary:** ${inputs.anniversary || ''}`,
    inputs.lyricInstructions ? `**Lyric Instructions:** ${inputs.lyricInstructions}` : '',
    '',
    '## Album Concept',
    '',
    album.concept,
    '',
    '## Track List',
    '',
    ...album.tracks.flatMap((track) => songToMarkdown(track)),
  ].join('\n');
}

export function albumToHtml(inputs: AlbumInputs, album: AlbumPlan): string {
  const tracks = album.tracks.map(songToHtml).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(album.title)}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #302521; line-height: 1.55; margin: 40px; }
    h1, h2, h3 { color: #6f2f39; }
    .meta, .note { color: #6a5a55; }
    .track { break-inside: avoid; border-top: 1px solid #dcc9c4; padding-top: 18px; margin-top: 22px; }
    pre { white-space: pre-wrap; font-family: inherit; background: #fbf7f3; padding: 14px; border: 1px solid #eadbd5; }
    @media print { body { margin: 0.5in; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(album.title)}</h1>
  <p class="meta"><strong>For:</strong> ${escapeHtml(inputs.wifeName || 'Robbin')}<br>
  <strong>From:</strong> ${escapeHtml(inputs.myName || '')}<br>
  <strong>Anniversary:</strong> ${escapeHtml(inputs.anniversary || '')}${inputs.lyricInstructions ? `<br>
  <strong>Lyric Instructions:</strong> ${escapeHtml(inputs.lyricInstructions)}` : ''}</p>
  <h2>Album Concept</h2>
  <p>${escapeHtml(album.concept)}</p>
  <h2>Track List</h2>
  ${tracks}
</body>
</html>`;
}

export function downloadText(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function songToMarkdown(track: SongPlan): string[] {
  return [
    `### ${track.id}. ${track.title}`,
    '',
    `- **Genre/style:** ${track.genreStyle}`,
    `- **Emotional purpose:** ${track.emotionalPurpose}`,
    `- **Description:** ${track.shortDescription}`,
    `- **Dedication:** ${track.dedicationNote}`,
    `- **Vocal style:** ${track.vocalStyle}`,
    `- **Instrumentation:** ${track.instrumentation}`,
    '',
    '**Lyrics Draft**',
    '',
    '```text',
    track.lyrics,
    '```',
    '',
    '**AI Music Prompt**',
    '',
    '```text',
    track.musicPrompt,
    '```',
    '',
  ];
}

function songToHtml(track: SongPlan): string {
  return `<section class="track">
    <h3>${track.id}. ${escapeHtml(track.title)}</h3>
    <p><strong>Genre/style:</strong> ${escapeHtml(track.genreStyle)}<br>
    <strong>Emotional purpose:</strong> ${escapeHtml(track.emotionalPurpose)}<br>
    <strong>Description:</strong> ${escapeHtml(track.shortDescription)}<br>
    <strong>Dedication:</strong> ${escapeHtml(track.dedicationNote)}<br>
    <strong>Vocal style:</strong> ${escapeHtml(track.vocalStyle)}<br>
    <strong>Instrumentation:</strong> ${escapeHtml(track.instrumentation)}</p>
    <h4>Lyrics Draft</h4>
    <pre>${escapeHtml(track.lyrics)}</pre>
    <h4>AI Music Prompt</h4>
    <pre>${escapeHtml(track.musicPrompt)}</pre>
  </section>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
