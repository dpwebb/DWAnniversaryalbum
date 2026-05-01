import type { KitsSettings, KitsVoiceModel, SongPlan, SunoCallbackRecord, SunoGeneratedTrack, SunoSettings } from '../types';
import { formatLyricsForSuno } from './lyrics';

const SUNO_BASE_URL = 'https://api.sunoapi.org/api/v1';
const KITS_BASE_URL = 'https://arpeggi.io/api/kits/v1';

type SunoGenerateResponse = {
  code: number;
  msg: string;
  data?: { taskId?: string };
};

type SunoRecordResponse = {
  code: number;
  msg: string;
  data?: {
    taskId?: string;
    status?: string;
    errorMessage?: string | null;
    response?: {
      sunoData?: Array<{
        id?: string;
        title?: string;
        audioUrl?: string;
        sourceAudioUrl?: string;
        source_audio_url?: string;
        streamAudioUrl?: string;
        sourceStreamAudioUrl?: string;
        source_stream_audio_url?: string;
        imageUrl?: string;
        sourceImageUrl?: string;
        source_image_url?: string;
        prompt?: string;
        modelName?: string;
        tags?: string;
        createTime?: string;
        duration?: number | null;
      }>;
    };
  };
};

type SunoReplaceSectionRequest = {
  sourceTaskId: string;
  sourceAudioId: string;
  prompt: string;
  tags: string;
  title: string;
  infillStartS: number;
  infillEndS: number;
  sourceDuration?: number | null;
};

type KitsInferenceJob = {
  id: number;
  status: string;
};

type KitsVoiceModelsResponse = {
  data: KitsVoiceModel[];
};

export async function createSunoSong(settings: SunoSettings, song: SongPlan, lyricInstructions = ''): Promise<string> {
  if (!settings.token.trim()) {
    throw new Error('Suno API token is required.');
  }

  const compactLyricInstructions = compactSunoText(lyricInstructions);
  const sunoLyrics = formatLyricsForSuno(song.lyrics);
  const body = {
    customMode: true,
    instrumental: settings.instrumental,
    model: settings.model,
    callBackUrl: settings.callbackUrl || undefined,
    prompt: settings.instrumental
      ? song.musicPrompt.slice(0, sunoPromptLimit(settings.model))
      : buildSunoLyricsPrompt(sunoLyrics, compactLyricInstructions).slice(0, sunoPromptLimit(settings.model)),
    style: buildSunoStyle(song, compactLyricInstructions).slice(0, sunoStyleLimit(settings.model)),
    title: song.title.slice(0, sunoTitleLimit(settings.model)),
    negativeTags: settings.negativeTags || undefined,
    vocalGender: settings.vocalGender || undefined,
  };

  const response = await fetch(`${SUNO_BASE_URL}/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as SunoGenerateResponse;
  if (!response.ok || payload.code !== 200 || !payload.data?.taskId) {
    throw new Error(payload.msg || 'Suno did not return a task ID.');
  }

  return payload.data.taskId;
}

export async function replaceSunoSection(settings: SunoSettings, request: SunoReplaceSectionRequest): Promise<string> {
  if (!settings.token.trim()) {
    throw new Error('Suno API token is required.');
  }

  const sourceTaskId = request.sourceTaskId.trim();
  const sourceAudioId = request.sourceAudioId.trim();
  const prompt = formatLyricsForSuno(request.prompt).trim();
  const tags = compactSunoText(request.tags);
  const title = compactSunoText(request.title);
  const infillStartS = roundSeconds(request.infillStartS);
  const infillEndS = roundSeconds(request.infillEndS);
  const duration = roundSeconds(infillEndS - infillStartS);

  if (!sourceTaskId) {
    throw new Error('Original Suno task ID is required before replacing a section.');
  }
  if (!sourceAudioId) {
    throw new Error('Select a generated Suno audio track before replacing a section.');
  }
  if (!prompt) {
    throw new Error('Replacement prompt or corrected lyric is required.');
  }
  if (!tags) {
    throw new Error('Replacement style tags are required.');
  }
  if (!title) {
    throw new Error('Replacement title is required.');
  }
  if (!Number.isFinite(infillStartS) || !Number.isFinite(infillEndS)) {
    throw new Error('Replacement start and end times must be valid numbers.');
  }
  if (infillStartS < 0 || infillEndS <= infillStartS) {
    throw new Error('Replacement end time must be after the start time.');
  }
  if (duration < 6 || duration > 60) {
    throw new Error('Replacement section must be between 6 and 60 seconds.');
  }
  if (request.sourceDuration && duration > request.sourceDuration / 2) {
    throw new Error('Replacement section should not exceed 50% of the original audio duration.');
  }

  const body = {
    taskId: sourceTaskId,
    audioId: sourceAudioId,
    prompt: prompt.slice(0, sunoPromptLimit(settings.model)),
    tags: tags.slice(0, sunoStyleLimit(settings.model)),
    title: title.slice(0, sunoTitleLimit(settings.model)),
    negativeTags: settings.negativeTags || undefined,
    infillStartS,
    infillEndS,
    callBackUrl: settings.callbackUrl || undefined,
  };

  const response = await fetch(`${SUNO_BASE_URL}/generate/replace-section`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as SunoGenerateResponse;
  if (!response.ok || payload.code !== 200 || !payload.data?.taskId) {
    throw new Error(payload.msg || 'Suno did not return a replacement task ID.');
  }

  return payload.data.taskId;
}

export async function getSunoSong(settings: SunoSettings, taskId: string) {
  if (!settings.token.trim()) {
    throw new Error('Suno API token is required.');
  }
  if (!taskId.trim()) {
    throw new Error('Suno task ID is required.');
  }

  const url = new URL(`${SUNO_BASE_URL}/generate/record-info`);
  url.searchParams.set('taskId', taskId.trim());

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${settings.token}`,
    },
  });
  const payload = (await response.json()) as SunoRecordResponse;

  if (!response.ok || payload.code !== 200 || !payload.data) {
    throw new Error(payload.msg || 'Unable to fetch Suno task status.');
  }

  const tracks = normalizeSunoTracks(payload.data.response?.sunoData ?? []);
  return {
    taskId: payload.data.taskId ?? taskId,
    status: payload.data.status ?? 'UNKNOWN',
    message: payload.data.errorMessage ?? payload.msg ?? '',
    audioUrls: audioUrlsFromTracks(tracks),
    streamUrls: streamUrlsFromTracks(tracks),
    imageUrls: imageUrlsFromTracks(tracks),
    tracks,
  };
}

export async function fetchSunoCallbacks(callbackUrl: string, taskId?: string): Promise<SunoCallbackRecord[]> {
  if (!callbackUrl.trim()) {
    throw new Error('Suno callback URL is required before callback records can be fetched.');
  }

  const url = new URL(callbackUrl);
  url.pathname = url.pathname.replace(/\/api\/suno\/callback\/?$/, '/api/suno/callbacks');
  if (!url.pathname.endsWith('/api/suno/callbacks')) {
    url.pathname = '/api/suno/callbacks';
  }
  if (taskId) {
    url.searchParams.set('taskId', taskId);
  }

  const response = await fetch(url);
  const payload = (await response.json()) as SunoCallbackRecord[] | { error?: string };
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error('error' in payload && payload.error ? payload.error : 'Unable to fetch Suno callbacks.');
  }

  return payload;
}

export async function fetchKitsVoiceModels(settings: KitsSettings): Promise<KitsVoiceModel[]> {
  if (!settings.token.trim()) {
    throw new Error('Kits AI token is required.');
  }

  const response = await fetch(`${KITS_BASE_URL}/voice-models?perPage=20&order=asc`, {
    headers: {
      Authorization: `Bearer ${settings.token}`,
    },
  });

  const payload = (await response.json()) as KitsVoiceModelsResponse | { message?: string };
  if (!response.ok || !('data' in payload)) {
    throw new Error('message' in payload && payload.message ? payload.message : 'Unable to fetch Kits voice models.');
  }

  return payload.data;
}

export async function createKitsVoiceConversion(settings: KitsSettings, soundFile: File): Promise<KitsInferenceJob> {
  if (!settings.token.trim()) {
    throw new Error('Kits AI token is required.');
  }
  if (!settings.voiceModelId.trim()) {
    throw new Error('Kits voice model ID is required.');
  }

  const form = new FormData();
  form.append('voiceModelId', settings.voiceModelId.trim());
  form.append('soundFile', soundFile);
  appendOptionalNumber(form, 'conversionStrength', settings.conversionStrength);
  appendOptionalNumber(form, 'modelVolumeMix', settings.modelVolumeMix);
  appendOptionalNumber(form, 'pitchShift', settings.pitchShift);

  const response = await fetch(`${KITS_BASE_URL}/voice-conversions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.token}`,
    },
    body: form,
  });

  const payload = (await response.json()) as KitsInferenceJob | { message?: string };
  if (!response.ok || !('id' in payload)) {
    throw new Error('message' in payload && payload.message ? payload.message : 'Unable to create Kits conversion.');
  }

  return payload;
}

export async function getKitsVoiceConversion(settings: KitsSettings, conversionId: string): Promise<KitsInferenceJob> {
  if (!settings.token.trim()) {
    throw new Error('Kits AI token is required.');
  }
  if (!conversionId.trim()) {
    throw new Error('Kits conversion ID is required.');
  }

  const response = await fetch(`${KITS_BASE_URL}/voice-conversions/${encodeURIComponent(conversionId.trim())}`, {
    headers: {
      Authorization: `Bearer ${settings.token}`,
    },
  });

  const payload = (await response.json()) as KitsInferenceJob | { message?: string };
  if (!response.ok || !('id' in payload)) {
    throw new Error('message' in payload && payload.message ? payload.message : 'Unable to fetch Kits conversion.');
  }

  return payload;
}

function appendOptionalNumber(form: FormData, key: string, value: string): void {
  if (value.trim()) {
    form.append(key, value.trim());
  }
}

function buildSunoLyricsPrompt(lyrics: string, lyricInstructions: string): string {
  if (!lyricInstructions) {
    return lyrics;
  }

  const direction = `[Lyric direction: ${lyricInstructions}]`;
  if (/^\s*\[Lyric direction:[^\]]*\]/i.test(lyrics)) {
    return lyrics.replace(/^\s*\[Lyric direction:[^\]]*\]\s*/i, `${direction}\n\n`);
  }

  return `${direction}\n\n${lyrics}`;
}

function buildSunoStyle(song: SongPlan, lyricInstructions: string): string {
  return compactSunoText(
    [
      song.genreStyle,
      song.musicPrompt,
      lyricInstructions ? `Lyric direction: ${lyricInstructions}` : '',
      `Vocal style: ${song.vocalStyle}`,
      `Instrumentation: ${song.instrumentation}`,
      `Theme: ${song.emotionalPurpose}`,
    ].join('. '),
  );
}

function compactSunoText(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim();
}

function normalizeSunoTracks(
  items: Array<
    Partial<SunoGeneratedTrack> & {
      source_audio_url?: string;
      source_stream_audio_url?: string;
      source_image_url?: string;
    }
  >,
): SunoGeneratedTrack[] {
  return items.map((item) => ({
    id: item.id ?? '',
    title: item.title ?? '',
    audioUrl: item.audioUrl ?? '',
    sourceAudioUrl: item.sourceAudioUrl ?? item.source_audio_url ?? '',
    streamAudioUrl: item.streamAudioUrl ?? '',
    sourceStreamAudioUrl: item.sourceStreamAudioUrl ?? item.source_stream_audio_url ?? '',
    imageUrl: item.imageUrl ?? '',
    sourceImageUrl: item.sourceImageUrl ?? item.source_image_url ?? '',
    prompt: item.prompt ?? '',
    modelName: item.modelName ?? '',
    tags: item.tags ?? '',
    createTime: item.createTime ?? '',
    duration: typeof item.duration === 'number' ? item.duration : null,
  }));
}

function audioUrlsFromTracks(tracks: SunoGeneratedTrack[]): string[] {
  return uniqueHttpUrls(tracks.flatMap((track) => [track.audioUrl, track.sourceAudioUrl]));
}

function streamUrlsFromTracks(tracks: SunoGeneratedTrack[]): string[] {
  return uniqueHttpUrls(tracks.flatMap((track) => [track.streamAudioUrl, track.sourceStreamAudioUrl]));
}

function imageUrlsFromTracks(tracks: SunoGeneratedTrack[]): string[] {
  return uniqueHttpUrls(tracks.flatMap((track) => [track.imageUrl, track.sourceImageUrl]));
}

function uniqueHttpUrls(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim() ?? '').filter(isHttpUrl)));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function roundSeconds(value: number): number {
  return Math.round(value * 100) / 100;
}

function sunoPromptLimit(model: SunoSettings['model']): number {
  return model === 'V4' ? 3000 : 5000;
}

function sunoStyleLimit(model: SunoSettings['model']): number {
  return model === 'V4' ? 200 : 1000;
}

function sunoTitleLimit(model: SunoSettings['model']): number {
  return model === 'V4' || model === 'V4_5ALL' ? 80 : 100;
}
