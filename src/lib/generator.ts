import type { AlbumInputs, AlbumPlan, SongPlan } from '../types';
import { formatLyricsForSuno } from './lyrics';
import { hashText, pick, sanitizeWords, sentenceJoin, splitList } from './text';

const trackArcs = [
  {
    focus: 'The first spark',
    description: 'Warmly remembers the beginning and why it still matters.',
    image: 'a room where time forgot to hurry',
    turn: 'what began as talk became a direction',
    refrain: 'I knew the night had changed when I was laughing with you',
  },
  {
    focus: 'Home in each other',
    description: 'Turns shared routines into something cinematic and lasting.',
    image: 'a porch light waiting through the rain',
    turn: 'ordinary hours started wearing gold',
    refrain: 'home is not a place unless it has your name in it',
  },
  {
    focus: 'The road we took',
    description: 'Celebrates the places that became part of the relationship.',
    image: 'a map marked by brave little detours',
    turn: 'every wrong road gave us something true',
    refrain: 'the long way only taught me where to find you',
  },
  {
    focus: 'Private language',
    description: 'Uses inside jokes as symbols of trust and playfulness.',
    image: 'a sentence only the two of us can hear',
    turn: 'one small laugh could soften any room',
    refrain: 'we speak in little sparks the world will never know',
  },
  {
    focus: 'Through weather',
    description: 'Honors resilience without making the song heavy.',
    image: 'a window bright after a difficult storm',
    turn: 'the hard years never got the final word',
    refrain: 'we kept a light on when the weather came through',
  },
  {
    focus: 'Quiet proof',
    description: 'Finds romance in ordinary care and daily steadiness.',
    image: 'two cups cooling beside the morning light',
    turn: 'love kept proving itself without a speech',
    refrain: 'the quiet things are how I know it is true',
  },
  {
    focus: 'Robbin in color',
    description: 'Centers Robbin as the emotional gravity of the album.',
    image: 'your name written in every bright room',
    turn: 'the whole world sharpened when you walked in',
    refrain: 'Robbin, you are the color I come back to',
  },
  {
    focus: 'The promise renewed',
    description: 'Looks directly at commitment and the next chapter.',
    image: 'two hands making tomorrow less unknown',
    turn: 'the old promise learned a new language',
    refrain: 'I would choose this promise in any year',
  },
  {
    focus: 'Kitchen light',
    description: 'Makes a small memory feel intimate and specific.',
    image: 'kitchen light across a late-night floor',
    turn: 'small rooms kept teaching me the size of love',
    refrain: 'I found forever in the light we left on',
  },
  {
    focus: 'Long way home',
    description: 'Builds a travel song around returning to each other.',
    image: 'headlights bending through a patient dark',
    turn: 'distance only gave the heart a chorus',
    refrain: 'every mile was practicing your name',
  },
  {
    focus: 'Still learning you',
    description: 'Keeps curiosity alive after years together.',
    image: 'a familiar face with another sunrise in it',
    turn: 'after all this time, wonder stayed',
    refrain: 'I am still learning the music of you',
  },
  {
    focus: 'Laugh lines',
    description: 'Lets humor and tenderness share the lead.',
    image: 'a laugh line drawn where worry used to be',
    turn: 'even our arguments learned how to smile',
    refrain: 'we made a comedy out of the climb',
  },
  {
    focus: 'Thirteen forever',
    description: 'Closes with a vow, a thank-you, and a forward glance.',
    image: 'thirteen lights burning down the road ahead',
    turn: 'gratitude became the song I wanted to leave',
    refrain: 'forever is still too small for what I mean',
  },
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
  const lyricInstructions = inputs.lyricInstructions.trim();
  const myName = inputs.myName.trim() || 'me';
  const wifeName = inputs.wifeName.trim() || 'Robbin';
  const anniversary = inputs.anniversary.trim() || 'this anniversary';

  return { memories, places, jokes, genres, includes, avoids, tone, lyricInstructions, myName, wifeName, anniversary };
}

function lineSet(seed: number, trackIndex: number, inputs: AlbumInputs): string[] {
  const ctx = contextFromInputs(inputs);
  const memories = ctx.memories.length ? ctx.memories : ['the first small moment that felt like forever'];
  const places = ctx.places.length ? ctx.places : ['the place where ordinary days became ours'];
  const jokes = ctx.jokes.length ? ctx.jokes : ['the joke only we understand'];
  const memory = pick(memories, seed + trackIndex);
  const secondMemory = pick(memories, seed + trackIndex * 31);
  const place = pick(places, seed + trackIndex * 3);
  const secondPlace = pick(places, seed + trackIndex * 37);
  const joke = pick(jokes, seed + trackIndex * 5);
  const include = pick(ctx.includes.length ? ctx.includes : ['always'], seed + trackIndex * 7);
  const arc = trackArcs[trackIndex - 1] ?? trackArcs[trackArcs.length - 1];
  const hook = capitalize(include);

  switch (Math.abs(seed + trackIndex) % 5) {
    case 0:
      return [
        `Verse 1:\n${ctx.wifeName}, I still see ${memory},\nA small beginning with a bigger light behind it.\nAt ${place}, ${arc.image},\nAnd I heard my future before I could describe it.`,
        `Lift:\n${arc.turn},\nYour laugh made room for every part of me.\nI did not need a perfect sign,\nJust the way you stayed and let the moment breathe.`,
        `Chorus:\n${hook} is the line I keep returning to,\nNo grand parade, just the steady good of you.\n${arc.refrain},\nAnd I choose it again in everything I do.`,
        `Verse 2:\nI keep a softer copy of ${secondMemory},\nThe kind of memory time cannot outgrow.\nThere was music hiding inside ${joke},\nA private little truth only we would know.`,
        `Bridge:\nIf tomorrow asks for courage, I will bring it to your side,\nIf the old road bends, I will learn the turn in stride.`,
        `Final Chorus:\n${hook} is the promise I can still renew,\nA thirteen-song thank-you, written straight to you.\n${arc.focus} is the melody carrying us through,\nAnd I am still becoming better loving you.`,
      ];
    case 1:
      return [
        `Verse 1:\nI had a restless kind of morning, then ${memory} stayed,\nYou came in like a window where the hard light changed.\nAt ${place}, I felt the old world move,\nOne look from you gave the day a groove.`,
        `Turnaround:\nCall it luck, call it timing, call it grace in plain clothes,\nI only know your hand is the road my heart knows.`,
        `Verse 2:\nThere was trouble in the background, there was laughter in the frame,\nThere was ${joke}, and nothing sounded quite the same.\n${arc.image} kept shining through,\nLike the blues had found a warmer shade of blue.`,
        `Chorus:\n${hook}, baby, that is what I mean,\nNot a perfect little story, but the truest one I have seen.\n${arc.refrain},\nAnd I would live it all again for the places in between.`,
        `Bridge:\nWe have had our low notes, we have held the line,\nEvery scar that softened us learned how to rhyme.`,
        `Last Verse:\nSo let ${secondPlace} remember how we made it through,\nLet the band play low and leave the light on you.\n${arc.focus} is the reason this song can stand,\nMy heart keeps time in the palm of your hand.`,
      ];
    case 2:
      return [
        `Opening Verse:\nThe room was ordinary until ${memory},\nThen ordinary opened like a door.\n${ctx.wifeName}, your name became a lantern,\nAnd I was not wandering like before.`,
        `Refrain:\nAround, around, the years go by,\nBut ${arc.refrain}.\nI hold that truth, I hold it high,\n${hook} under every sky.`,
        `Second Verse:\nAt ${place}, we learned the smaller dances,\nKeys on the table, plans in the air.\nEven ${joke} turned into a compass,\nPointing me back to why I care.`,
        `Middle Eight:\nSome love is loud, but ours can whisper,\nStill it fills the room from wall to wall.\n${arc.turn},\nAnd I would answer every call.`,
        `Last Refrain:\nAround, around, the years go by,\n${arc.focus} keeps shining through.\nI hold that truth, I hold it high,\nStill turning, still learning you.`,
      ];
    case 3:
      return [
        `Verse:\nYou say ${joke}, and I know where we are,\nHalfway through a story, laughing in the car.\n${memory} still taps on the glass,\nReminding me how quickly forever can pass.`,
        `Response:\nAnd I say stay, not because the day is easy,\nBut because your steady heart keeps choosing me.`,
        `Chorus:\n${hook}, let it ring out clear,\nIn every messy, tender, ordinary year.\n${arc.refrain},\nThat is the secret language that brought us here.`,
        `Verse:\nAt ${place}, we made our own translation,\nA glance, a joke, a little celebration.\n${arc.image} pulled the dark apart,\nAnd left a little room for my grateful heart.`,
        `Bridge:\nIf we lose the map, we still know the sound,\nTwo voices laughing till the way is found.`,
        `Chorus Return:\n${hook}, let it ring out clear,\n${arc.focus} is the reason I am still here.\nEvery private word, every road we drew,\nTurns into a chorus when I sing to you.`,
      ];
    default:
      return [
        `Scene:\nThere is a light I trust inside ${secondPlace},\nThe kind that does not need to prove a thing.\nIt catches on ${secondMemory},\nAnd suddenly the quiet starts to sing.`,
        `Chorus:\nI am not counting years, I am counting ways,\nYou made a shelter out of ordinary days.\n${arc.refrain},\n${hook} is the prayer my grateful heart says.`,
        `Memory Verse:\nAt ${place}, I learned the shape of staying,\nNot as a speech, but as a hand in mine.\nEven ${joke} becomes a little hymn,\nA funny sacred mark from another time.`,
        `Promise:\nLet the next door open, let the next road start,\nI will bring my better self and my honest heart.\n${arc.turn},\nAnd I will keep showing up for my part.`,
        `Outro:\nSo here is ${arc.focus}, plain and true,\nA final little flame I am giving back to you.\nIf forever needs a sound to carry through,\nLet it sound like me still loving you.`,
      ];
  }
}

function buildSong(inputs: AlbumInputs, seed: number, trackNumber: number): SongPlan {
  const ctx = contextFromInputs(inputs);
  const arc = trackArcs[trackNumber - 1] ?? trackArcs[trackArcs.length - 1];
  const genre = pick(ctx.genres.length ? ctx.genres : genreFallbacks, seed + trackNumber * 11);
  const memory = pick(ctx.memories.length ? ctx.memories : ['a memory that still feels close'], seed + trackNumber * 13);
  const place = pick(ctx.places.length ? ctx.places : ['somewhere meaningful'], seed + trackNumber * 17);
  const joke = pick(ctx.jokes.length ? ctx.jokes : ['a private laugh'], seed + trackNumber * 19);
  const title = sanitizeWords(
    `${capitalize(pick(titleNouns, seed + trackNumber))} ${pick(titleVerbs, seed + trackNumber * 2)} ${trackNumber === 7 ? ctx.wifeName : pick(titleNouns, seed + trackNumber * 3)}`,
    ctx.avoids,
  );
  const shortDescription = sanitizeWords(`${arc.description} It draws from ${memory} and ${place}.`, ctx.avoids);
  const dedicationNote = sanitizeWords(`For ${ctx.wifeName}, from ${ctx.myName}, with a nod to ${joke}.`, ctx.avoids);
  const lyrics = buildLyrics(inputs, seed, trackNumber);

  const song: SongPlan = {
    id: trackNumber,
    title,
    genreStyle: sanitizeWords(genre, ctx.avoids),
    emotionalPurpose: sanitizeWords(arc.focus, ctx.avoids),
    shortDescription,
    dedicationNote,
    lyrics,
    lyricsLocked: true,
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
  const seed = hashText(`${album.seed}:lyrics:${trackId}:${generationCount}`);
  return {
    ...album,
    tracks: album.tracks.map((track) =>
      track.id === trackId
        ? {
            ...track,
            lyrics: buildLyrics(inputs, seed, trackId),
            lyricsLocked: true,
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
  const lyricDirection = ctx.lyricInstructions ? ` Lyric direction: ${compactInstruction(ctx.lyricInstructions)}.` : '';
  return sanitizeWords(
    `Create an original ${song.genreStyle} anniversary song at ${tempo}. Tone: ${ctx.tone}. Theme: ${song.emotionalPurpose} for ${ctx.wifeName}.${lyricDirection} Vocal style: ${song.vocalStyle}. Instrumentation: ${song.instrumentation}. Shape the arrangement around the lyric sections and keep the hook memorable without copying any existing song. Keep lyrics original, sincere, adult, romantic but not cheesy. Do not imitate any living artist or use copyrighted lyrics.`,
    ctx.avoids,
  );
}

function buildLyrics(inputs: AlbumInputs, seed: number, trackNumber: number): string {
  const ctx = contextFromInputs(inputs);
  const lyricDirection = ctx.lyricInstructions ? `[Lyric direction: ${compactInstruction(ctx.lyricInstructions)}]` : '';
  const lyrics = sanitizeWords([lyricDirection, lineSet(seed, trackNumber, inputs).join('\n\n')].filter(Boolean).join('\n\n'), ctx.avoids);
  return formatLyricsForSuno(lyrics);
}

function compactInstruction(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
