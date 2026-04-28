import type { AlbumInputs, AlbumPlan, SongPlan } from '../types';
import { hashText, pick, sanitizeWords, sentenceJoin, splitList } from './text';

const trackArcs = [
  ['The first spark', 'Warmly remembers the beginning and why it still matters.'],
  ['Home in each other', 'Turns shared routines into something cinematic and lasting.'],
  ['The road we took', 'Celebrates the places that became part of the relationship.'],
  ['Private language', 'Uses inside jokes as symbols of trust and playfulness.'],
  ['Through weather', 'Honors resilience without making the song heavy.'],
  ['Quiet proof', 'Finds romance in ordinary care and daily steadiness.'],
  ['Robbin in color', 'Centers Robbin as the emotional gravity of the album.'],
  ['The promise renewed', 'Looks directly at commitment and the next chapter.'],
  ['Kitchen light', 'Makes a small memory feel intimate and specific.'],
  ['Long way home', 'Builds a travel song around returning to each other.'],
  ['Still learning you', 'Keeps curiosity alive after years together.'],
  ['Laugh lines', 'Lets humor and tenderness share the lead.'],
  ['Thirteen forever', 'Closes with a vow, a thank-you, and a forward glance.'],
] as const;

const titleFragments = [
  'Thirteen Ways Home',
  'Every Year, Robbin',
  'The Map We Made',
  'Still Choosing You',
  'Rooms Full of Us',
  'Our Favorite Weather',
  'Where the Years Go Soft',
];

const genreFallbacks = [
  'warm acoustic pop',
  'piano-led soul ballad',
  'folk-pop waltz',
  'soft indie rock',
  'cinematic singer-songwriter',
  'gentle R&B',
  'bright anniversary pop',
];

const vocalStyles = [
  'intimate lead vocal with soft harmonies in the chorus',
  'clear conversational vocal, close-mic and sincere',
  'warm tenor/baritone delivery with layered backing vocals',
  'gentle duet-ready phrasing with a heartfelt bridge',
  'restrained verse vocal opening into a full chorus',
];

const instruments = [
  'fingerpicked acoustic guitar, brushed drums, upright bass, and subtle strings',
  'felt piano, soft kick, warm bass, glockenspiel accents, and cello swells',
  'clean electric guitar, light percussion, organ pads, and background harmonies',
  'nylon guitar, hand percussion, muted trumpet, and cinematic strings',
  'piano, acoustic guitar, restrained drums, bass, and airy synth textures',
];

const titleNouns = ['light', 'map', 'porch', 'year', 'promise', 'road', 'letter', 'room', 'song', 'harbor'];
const titleVerbs = ['keeps', 'remembers', 'carries', 'finds', 'holds', 'answers', 'turns toward'];

function contextFromInputs(inputs: AlbumInputs) {
  const memories = splitList(inputs.memories);
  const places = splitList(inputs.places);
  const jokes = splitList(inputs.insideJokes);
  const genres = splitList(inputs.genres);
  const includes = splitList(inputs.includeWords);
  const avoids = splitList(inputs.avoidWords);
  const tone = inputs.tone.trim() || 'tender, grateful, hopeful';
  const myName = inputs.myName.trim() || 'me';
  const wifeName = inputs.wifeName.trim() || 'Robbin';
  const anniversary = inputs.anniversary.trim() || 'this anniversary';

  return { memories, places, jokes, genres, includes, avoids, tone, myName, wifeName, anniversary };
}

function lineSet(seed: number, trackIndex: number, inputs: AlbumInputs): string[] {
  const ctx = contextFromInputs(inputs);
  const memory = pick(ctx.memories.length ? ctx.memories : ['the first small moment that felt like forever'], seed + trackIndex);
  const place = pick(ctx.places.length ? ctx.places : ['the place where ordinary days became ours'], seed + trackIndex * 3);
  const joke = pick(ctx.jokes.length ? ctx.jokes : ['the joke only we understand'], seed + trackIndex * 5);
  const include = pick(ctx.includes.length ? ctx.includes : ['always'], seed + trackIndex * 7);
  const arc = trackArcs[trackIndex - 1];

  return [
    `Verse 1:\nI keep ${memory} folded where the daylight lands,\n${ctx.wifeName}, you turned a passing hour into plans.\nAt ${place}, time learned how to move slowly,\nAnd every quiet minute started sounding holy.`,
    `Pre-Chorus:\nWe do not need a perfect sky to know what we have found,\nYour laugh pulls every scattered piece back down.`,
    `Chorus:\nSo here is my ${include}, steady and true,\nEvery road I understand is pointing back to you.\nThrough every year, every door, every ordinary view,\nI am still becoming better by loving you.`,
    `Verse 2:\nThere is music in ${joke}, and grace in how we stay,\nIn coffee cups, late drives, and the words we do not say.\nIf the world gets loud, I know the softer part:\nYour name is the room I keep inside my heart.`,
    `Bridge:\nLet the future bring its weather, let the calendars turn wide,\nI will meet you in the middle, I will stand there by your side.`,
    `Final Chorus:\nSo here is my promise, familiar and new,\nA thirteen-song thank-you for a life I get with you.\n${arc[0]} becomes the melody we carry through,\nAnd I am still home whenever I am loving you.`,
  ];
}

function buildSong(inputs: AlbumInputs, seed: number, trackNumber: number): SongPlan {
  const ctx = contextFromInputs(inputs);
  const arc = trackArcs[trackNumber - 1];
  const genre = pick(ctx.genres.length ? ctx.genres : genreFallbacks, seed + trackNumber * 11);
  const memory = pick(ctx.memories.length ? ctx.memories : ['a memory that still feels close'], seed + trackNumber * 13);
  const place = pick(ctx.places.length ? ctx.places : ['somewhere meaningful'], seed + trackNumber * 17);
  const joke = pick(ctx.jokes.length ? ctx.jokes : ['a private laugh'], seed + trackNumber * 19);
  const title = `${capitalize(pick(titleNouns, seed + trackNumber))} ${pick(titleVerbs, seed + trackNumber * 2)} ${trackNumber === 7 ? ctx.wifeName : pick(titleNouns, seed + trackNumber * 3)}`;
  const lyrics = sanitizeWords(lineSet(seed, trackNumber, inputs).join('\n\n'), ctx.avoids);

  const song: SongPlan = {
    id: trackNumber,
    title,
    genreStyle: genre,
    emotionalPurpose: arc[0],
    shortDescription: `${arc[1]} It draws from ${memory} and ${place}.`,
    dedicationNote: `For ${ctx.wifeName}, from ${ctx.myName}, with a nod to ${joke}.`,
    lyrics,
    vocalStyle: pick(vocalStyles, seed + trackNumber * 23),
    instrumentation: pick(instruments, seed + trackNumber * 29),
    musicPrompt: '',
  };

  song.musicPrompt = buildMusicPrompt(inputs, song, seed + trackNumber);
  return song;
}

export function generateAlbum(inputs: AlbumInputs, generationCount = 0): AlbumPlan {
  const ctx = contextFromInputs(inputs);
  const seed = hashText(JSON.stringify(inputs) + generationCount);
  const titleBase = pick(titleFragments, seed);
  const title = sanitizeWords(`${titleBase}: 13 Songs for ${ctx.wifeName}`, ctx.avoids);
  const memoryPhrase = sentenceJoin(ctx.memories.slice(0, 3), 'shared memories');
  const placePhrase = sentenceJoin(ctx.places.slice(0, 3), 'the places that shaped the relationship');
  const concept = sanitizeWords(
    `A ${ctx.tone} anniversary album from ${ctx.myName} to ${ctx.wifeName}, built around ${memoryPhrase}, ${placePhrase}, private humor, and the feeling of choosing each other again on ${ctx.anniversary}.`,
    ctx.avoids,
  );

  return {
    title,
    concept,
    tracks: Array.from({ length: 13 }, (_, index) => buildSong(inputs, seed, index + 1)),
    createdAt: new Date().toISOString(),
    seed,
  };
}

export function regenerateTitle(inputs: AlbumInputs, album: AlbumPlan, generationCount: number): AlbumPlan {
  const ctx = contextFromInputs(inputs);
  const seed = hashText(`${album.seed}:title:${generationCount}:${inputs.anniversary}`);
  return {
    ...album,
    title: sanitizeWords(`${pick(titleFragments, seed)}: An Anniversary Album for ${ctx.wifeName}`, ctx.avoids),
    seed,
  };
}

export function regenerateSong(inputs: AlbumInputs, album: AlbumPlan, trackId: number, generationCount: number): AlbumPlan {
  const seed = hashText(`${album.seed}:song:${trackId}:${generationCount}`);
  return {
    ...album,
    tracks: album.tracks.map((track) => (track.id === trackId ? buildSong(inputs, seed, trackId) : track)),
    seed,
  };
}

export function regenerateLyrics(inputs: AlbumInputs, album: AlbumPlan, trackId: number, generationCount: number): AlbumPlan {
  const ctx = contextFromInputs(inputs);
  const seed = hashText(`${album.seed}:lyrics:${trackId}:${generationCount}`);
  return {
    ...album,
    tracks: album.tracks.map((track) =>
      track.id === trackId
        ? {
            ...track,
            lyrics: sanitizeWords(lineSet(seed, trackId, inputs).join('\n\n'), ctx.avoids),
          }
        : track,
    ),
    seed,
  };
}

export function regenerateMusicPrompt(inputs: AlbumInputs, album: AlbumPlan, trackId: number, generationCount: number): AlbumPlan {
  const seed = hashText(`${album.seed}:prompt:${trackId}:${generationCount}`);
  return {
    ...album,
    tracks: album.tracks.map((track) =>
      track.id === trackId
        ? {
            ...track,
            musicPrompt: buildMusicPrompt(inputs, track, seed),
          }
        : track,
    ),
    seed,
  };
}

function buildMusicPrompt(inputs: AlbumInputs, song: SongPlan, seed: number): string {
  const ctx = contextFromInputs(inputs);
  const tempo = pick(['72 BPM', '82 BPM', '94 BPM', '104 BPM', 'slow 6/8 feel', 'mid-tempo 4/4'], seed);
  return sanitizeWords(
    `Create an original ${song.genreStyle} anniversary song at ${tempo}. Tone: ${ctx.tone}. Theme: ${song.emotionalPurpose} for ${ctx.wifeName}. Vocal style: ${song.vocalStyle}. Instrumentation: ${song.instrumentation}. Keep lyrics original, sincere, adult, romantic but not cheesy. Do not imitate any living artist or use copyrighted lyrics.`,
    ctx.avoids,
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
