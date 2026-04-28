import type { KitsSettings, KitsVoiceModel, SongPlan, SunoSettings } from '../types';

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
        audioUrl?: string;
        streamAudioUrl?: string;
      }>;
    };
  };
};

type KitsInferenceJob = {
  id: number;
  status: string;
};

type KitsVoiceModelsResponse = {
  data: KitsVoiceModel[];
};

export async function createSunoSong(settings: SunoSettings, song: SongPlan): Promise<string> {
  if (!settings.token.trim()) {
    throw new Error('Suno API token is required.');
  }

  const body = {
    customMode: true,
    instrumental: settings.instrumental,
    model: settings.model,
    callBackUrl: settings.callbackUrl || undefined,
    prompt: settings.instrumental ? song.musicPrompt.slice(0, 500) : song.lyrics.slice(0, 5000),
    style: song.genreStyle.slice(0, 1000),
    title: song.title.slice(0, settings.model === 'V4' || settings.model === 'V4_5ALL' ? 80 : 100),
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

  const items = payload.data.response?.sunoData ?? [];
  return {
    taskId: payload.data.taskId ?? taskId,
    status: payload.data.status ?? 'UNKNOWN',
    message: payload.data.errorMessage ?? payload.msg ?? '',
    audioUrls: items.map((item) => item.audioUrl).filter((url): url is string => Boolean(url)),
    streamUrls: items.map((item) => item.streamAudioUrl).filter((url): url is string => Boolean(url)),
  };
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
