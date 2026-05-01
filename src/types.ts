export type AlbumInputs = {
  anniversary: string;
  wifeName: string;
  myName: string;
  memories: string;
  places: string;
  insideJokes: string;
  genres: string;
  tone: string;
  lyricInstructions: string;
  includeWords: string;
  avoidWords: string;
};

export type SongPlan = {
  id: number;
  title: string;
  genreStyle: string;
  emotionalPurpose: string;
  shortDescription: string;
  dedicationNote: string;
  lyrics: string;
  vocalStyle: string;
  instrumentation: string;
  musicPrompt: string;
};

export type AlbumPlan = {
  title: string;
  concept: string;
  tracks: SongPlan[];
  createdAt: string;
  seed: number;
};

export type DraftState = {
  inputs: AlbumInputs;
  album: AlbumPlan | null;
  generationCount: number;
  apiResults?: ApiResults;
};

export type GitHubStorageSettings = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
};

export type SunoSettings = {
  token: string;
  model: 'V4' | 'V4_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V5' | 'V5_5';
  callbackUrl: string;
  vocalGender: '' | 'm' | 'f';
  negativeTags: string;
  instrumental: boolean;
};

export type KitsSettings = {
  token: string;
  voiceModelId: string;
  conversionStrength: string;
  modelVolumeMix: string;
  pitchShift: string;
};

export type ApiSettings = {
  suno: SunoSettings;
  kits: KitsSettings;
};

export type SunoTrackResult = {
  taskId: string;
  status: string;
  message: string;
  audioUrls: string[];
  streamUrls: string[];
  imageUrls?: string[];
  updatedAt: string;
};

export type KitsTrackResult = {
  conversionId: string;
  status: string;
  message: string;
  updatedAt: string;
};

export type ApiTrackResult = {
  suno?: SunoTrackResult;
  kits?: KitsTrackResult;
};

export type ApiResults = Record<number, ApiTrackResult>;

export type KitsVoiceModel = {
  id: number;
  title: string;
  tags?: string[];
};

export type SunoCallbackTrack = {
  id: string;
  title: string;
  audioUrl: string;
  sourceAudioUrl: string;
  streamAudioUrl: string;
  sourceStreamAudioUrl: string;
  imageUrl: string;
  sourceImageUrl: string;
  prompt: string;
  modelName: string;
  tags: string;
  createTime: string;
  duration: number | null;
};

export type SunoCallbackRecord = {
  receivedAt: string;
  code: number;
  msg: string;
  taskId: string;
  callbackType: string;
  tracks: SunoCallbackTrack[];
};
