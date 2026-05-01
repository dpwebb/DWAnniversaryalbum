import { useEffect, useMemo, useState } from 'react';
import albumDraft from '../album.json';
import { defaultInputs } from './data/defaults';
import {
  generateAlbum,
  regenerateLyrics,
  regenerateMusicPrompt,
  regenerateSong,
  regenerateTitle,
} from './lib/generator';
import {
  createKitsVoiceConversion,
  createSunoSong,
  fetchSunoCallbacks,
  fetchKitsVoiceModels,
  getKitsVoiceConversion,
  getSunoSong,
  replaceSunoSection,
} from './lib/apiIntegrations';
import { loadDraftFromGitHub, saveDraftToGitHub, validateGitHubSettings } from './lib/githubStorage';
import {
  clearDraft,
  loadApiSettings,
  loadDraft,
  loadGitHubSettings,
  saveApiSettings,
  saveDraft,
  saveGitHubSettings,
} from './lib/storage';
import { albumToHtml, albumToMarkdown, downloadText } from './lib/exporters';
import type {
  AlbumInputs,
  AlbumPlan,
  ApiResults,
  ApiSettings,
  DraftState,
  GitHubStorageSettings,
  KitsVoiceModel,
  SongPlan,
  SunoCallbackTrack,
  SunoGeneratedTrack,
  SunoReplacementResult,
} from './types';

const sampleMemories = 'our first trip together, quiet Sunday mornings, the day we knew this was real';
const samplePlaces = 'home, the beach, our favorite restaurant';
const sampleJokes = 'the parking lot debate, our secret phrase, the wrong-turn adventure';
const bundledDraft = albumDraft as DraftState;
type DraftPayload = Partial<DraftState> & { inputs: Partial<AlbumInputs> };
type EditableTrackTextKey =
  | 'title'
  | 'genreStyle'
  | 'emotionalPurpose'
  | 'shortDescription'
  | 'dedicationNote'
  | 'vocalStyle'
  | 'instrumentation'
  | 'lyrics'
  | 'musicPrompt';
type SunoSectionReplacementInput = {
  sourceTaskId: string;
  sourceAudioId: string;
  sourceDuration?: number | null;
  infillStartS: number;
  infillEndS: number;
  prompt: string;
  tags: string;
  title: string;
};

function productionCallbackUrl() {
  return `${window.location.origin}/api/suno/callback`;
}

function normalizeInputs(inputs: Partial<AlbumInputs>): AlbumInputs {
  return { ...defaultInputs, ...inputs, lyricInstructions: inputs.lyricInstructions ?? '' };
}

function normalizeDraft(draft: DraftPayload): DraftState {
  const inputs = normalizeInputs(draft.inputs);
  const generationCount = draft.generationCount ?? 0;
  let album = draft.album ?? null;

  if (album && (!Array.isArray(album.tracks) || album.tracks.length !== 13)) {
    const generatedAlbum = generateAlbum(inputs, generationCount);
    album = {
      ...generatedAlbum,
      title: album.title || generatedAlbum.title,
      concept: album.concept || generatedAlbum.concept,
      createdAt: album.createdAt || generatedAlbum.createdAt,
      seed: album.seed || generatedAlbum.seed,
    };
  }

  if (album) {
    album = {
      ...album,
      tracks: album.tracks.map((track) => ({
        ...track,
        lyricsLocked: track.lyricsLocked ?? Boolean(track.lyrics.trim()),
      })),
    };
  }

  return {
    inputs,
    album,
    generationCount,
    apiResults: draft.apiResults ?? {},
  };
}

export default function App() {
  const saved = useMemo(() => normalizeDraft(loadDraft() ?? bundledDraft), []);
  const savedGitHubSettings = useMemo(() => loadGitHubSettings(), []);
  const savedApiSettings = useMemo(() => loadApiSettings(), []);
  const [inputs, setInputs] = useState<AlbumInputs>(saved?.inputs ?? defaultInputs);
  const [album, setAlbum] = useState<AlbumPlan | null>(saved?.album ?? null);
  const [generationCount, setGenerationCount] = useState(saved?.generationCount ?? 0);
  const [apiResults, setApiResults] = useState<ApiResults>(saved?.apiResults ?? {});
  const [githubSettings, setGithubSettings] = useState<GitHubStorageSettings>(
    savedGitHubSettings ?? {
      owner: '',
      repo: '',
      branch: 'main',
      path: 'anniversary-album-draft.json',
      token: '',
    },
  );
  const [apiSettings, setApiSettings] = useState<ApiSettings>(
    savedApiSettings ?? {
      suno: {
        token: '',
        model: 'V5_5',
        callbackUrl: '',
        vocalGender: '',
        negativeTags: 'copyrighted lyrics, living artist imitation',
        instrumental: false,
      },
      kits: {
        token: '',
        voiceModelId: '',
        conversionStrength: '0.5',
        modelVolumeMix: '0.5',
        pitchShift: '0',
      },
    },
  );
  const [voiceModels, setVoiceModels] = useState<KitsVoiceModel[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [apiBusy, setApiBusy] = useState('');
  const [importDraftText, setImportDraftText] = useState('');
  const [status, setStatus] = useState('Draft autosaves locally and can sync to GitHub.');
  const [error, setError] = useState('');

  useEffect(() => {
    const draft: DraftState = { inputs, album, generationCount, apiResults };
    saveDraft(draft);
  }, [inputs, album, generationCount, apiResults]);

  useEffect(() => {
    saveGitHubSettings(githubSettings);
  }, [githubSettings]);

  useEffect(() => {
    saveApiSettings(apiSettings);
  }, [apiSettings]);

  function updateInput<K extends keyof AlbumInputs>(key: K, value: AlbumInputs[K]) {
    setInputs((current) => ({ ...current, [key]: value }));
    setError('');
  }

  function updateGitHubSetting<K extends keyof GitHubStorageSettings>(key: K, value: GitHubStorageSettings[K]) {
    setGithubSettings((current) => ({ ...current, [key]: value }));
    setError('');
  }

  function updateSunoSetting<K extends keyof ApiSettings['suno']>(key: K, value: ApiSettings['suno'][K]) {
    setApiSettings((current) => ({ ...current, suno: { ...current.suno, [key]: value } }));
    setError('');
  }

  function updateKitsSetting<K extends keyof ApiSettings['kits']>(key: K, value: ApiSettings['kits'][K]) {
    setApiSettings((current) => ({ ...current, kits: { ...current.kits, [key]: value } }));
    setError('');
  }

  function handleGenerate() {
    try {
      const nextCount = generationCount + 1;
      setAlbum(generateAlbum(inputs, nextCount));
      setGenerationCount(nextCount);
      setStatus('Generated a fresh 13-song album plan.');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate the album.');
    }
  }

  function handleRegenerateAlbum() {
    handleGenerate();
  }

  function handleRegenerateTitle() {
    if (!album) return;
    const nextCount = generationCount + 1;
    setAlbum(regenerateTitle(inputs, album, nextCount));
    setGenerationCount(nextCount);
    setStatus('Regenerated the album title.');
  }

  function handleTrackAction(trackId: number, action: 'song' | 'lyrics' | 'prompt') {
    if (!album) return;
    const nextCount = generationCount + 1;
    const changedAlbum =
      action === 'song'
        ? regenerateSong(inputs, album, trackId, nextCount)
        : action === 'lyrics'
          ? regenerateLyrics(inputs, album, trackId, nextCount)
          : regenerateMusicPrompt(inputs, album, trackId, nextCount);
    const currentTrack = album.tracks.find((track) => track.id === trackId);
    const nextAlbum =
      action === 'song' && currentTrack?.lyricsLocked
        ? {
            ...changedAlbum,
            tracks: changedAlbum.tracks.map((track) =>
              track.id === trackId
                ? {
                    ...track,
                    lyrics: currentTrack.lyrics,
                    lyricsLocked: true,
                  }
                : track,
            ),
          }
        : changedAlbum;
    setAlbum(nextAlbum);
    setGenerationCount(nextCount);
    setStatus(
      action === 'song'
        ? currentTrack?.lyricsLocked
          ? `Regenerated track ${trackId} while preserving locked lyrics.`
          : `Regenerated track ${trackId}.`
        : action === 'lyrics'
          ? `Regenerated lyrics for track ${trackId}.`
          : `Regenerated the music prompt for track ${trackId}.`,
    );
  }

  function updateTrackText(trackId: number, key: EditableTrackTextKey, value: string) {
    setAlbum((current) => {
      if (!current) return current;
      return {
        ...current,
        tracks: current.tracks.map((track) => {
          if (track.id !== trackId) return track;
          if (key === 'lyrics' && track.lyricsLocked) return track;
          return { ...track, [key]: value };
        }),
      };
    });
    if (key === 'lyrics' && album?.tracks.find((track) => track.id === trackId)?.lyricsLocked) {
      setError('Unlock the lyrics before editing them.');
      return;
    }
    setError('');
  }

  function setTrackLyricsLocked(trackId: number, lyricsLocked: boolean) {
    setAlbum((current) => {
      if (!current) return current;
      return {
        ...current,
        tracks: current.tracks.map((track) => (track.id === trackId ? { ...track, lyricsLocked } : track)),
      };
    });
    setError('');
    setStatus(lyricsLocked ? `Locked lyrics for track ${trackId}.` : `Unlocked lyrics for track ${trackId}.`);
  }

  async function copyAlbum() {
    if (!album) return;
    try {
      await navigator.clipboard.writeText(albumToMarkdown(inputs, album));
      setStatus('Copied the album plan to the clipboard.');
      setError('');
    } catch {
      setError('Clipboard access was blocked by the browser. Use Markdown export instead.');
    }
  }

  function exportMarkdown() {
    if (!album) return;
    downloadText('anniversary-album-plan.md', albumToMarkdown(inputs, album), 'text/markdown;charset=utf-8');
    setStatus('Exported Markdown.');
  }

  function exportHtml() {
    if (!album) return;
    downloadText('anniversary-album-plan.html', albumToHtml(inputs, album), 'text/html;charset=utf-8');
    setStatus('Exported PDF-ready HTML.');
  }

  function exportJson() {
    if (!album) return;
    downloadText(
      'anniversary-album-plan.json',
      JSON.stringify(currentDraft(), null, 2),
      'application/json;charset=utf-8',
    );
    setStatus('Exported JSON.');
  }

  async function copyDraftJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentDraft(), null, 2));
      setStatus('Copied draft JSON to the clipboard.');
      setError('');
    } catch {
      setError('Clipboard access was blocked by the browser.');
    }
  }

  function importDraftJson() {
    try {
      const parsed = JSON.parse(importDraftText) as Partial<DraftState> & {
        inputs?: Partial<AlbumInputs>;
        album?: AlbumPlan | null;
      };
      if (!parsed.inputs) {
        throw new Error('Draft JSON is missing inputs.');
      }

      applyDraft({ ...parsed, inputs: parsed.inputs });
      setImportDraftText('');
      setStatus('Imported draft JSON.');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to import draft JSON.');
    }
  }

  function applyDraft(draft: DraftPayload) {
    const normalizedDraft = normalizeDraft(draft);
    setInputs(normalizedDraft.inputs);
    setAlbum(normalizedDraft.album);
    setGenerationCount(normalizedDraft.generationCount);
    setApiResults(normalizedDraft.apiResults ?? {});
  }

  function loadBundledDraft() {
    applyDraft(bundledDraft);
    setError('');
    setStatus('Loaded album.json into the local draft.');
  }

  function currentDraft(): DraftState {
    return { inputs, album, generationCount, apiResults };
  }

  function resetDraft() {
    clearDraft();
    setInputs(defaultInputs);
    setAlbum(null);
    setGenerationCount(0);
    setError('');
    setStatus('Cleared the local draft.');
  }

  async function saveToGitHub() {
    const validationError = validateGitHubSettings(githubSettings);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSyncing(true);
    setError('');
    try {
      await saveDraftToGitHub(githubSettings, { inputs, album, generationCount, apiResults });
      setStatus(`Saved draft to ${githubSettings.owner}/${githubSettings.repo}/${githubSettings.path}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save draft to GitHub.');
    } finally {
      setSyncing(false);
    }
  }

  async function loadFromGitHub() {
    const validationError = validateGitHubSettings(githubSettings);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSyncing(true);
    setError('');
    try {
      const draft = await loadDraftFromGitHub(githubSettings);
      setInputs(draft.inputs);
      setAlbum(draft.album);
      setGenerationCount(draft.generationCount);
      setApiResults(draft.apiResults ?? {});
      setStatus(`Loaded draft from ${githubSettings.owner}/${githubSettings.repo}/${githubSettings.path}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load draft from GitHub.');
    } finally {
      setSyncing(false);
    }
  }

  async function sendTrackToSuno(track: SongPlan) {
    setApiBusy(`suno-${track.id}`);
    setError('');
    try {
      const taskId = await createSunoSong(apiSettings.suno, track, inputs.lyricInstructions);
      setApiResults((current) => ({
        ...current,
        [track.id]: {
          ...current[track.id],
          suno: {
            taskId,
            status: 'SUBMITTED',
            message: 'Suno task created. Check status after the service has processed it.',
            audioUrls: [],
            streamUrls: [],
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      setStatus(`Submitted track ${track.id} to Suno.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit the track to Suno.');
    } finally {
      setApiBusy('');
    }
  }

  async function checkSunoStatus(trackId: number) {
    const taskId = apiResults[trackId]?.suno?.taskId;
    setApiBusy(`suno-check-${trackId}`);
    setError('');
    try {
      const result = await getSunoSong(apiSettings.suno, taskId ?? '');
      setApiResults((current) => ({
        ...current,
        [trackId]: {
          ...current[trackId],
          suno: { ...result, updatedAt: new Date().toISOString() },
        },
      }));
      setStatus(`Updated Suno status for track ${trackId}: ${result.status}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to check Suno status.');
    } finally {
      setApiBusy('');
    }
  }

  async function replaceSunoTrackSection(track: SongPlan, request: SunoSectionReplacementInput) {
    setApiBusy(`suno-replace-${track.id}`);
    setError('');
    try {
      const taskId = await replaceSunoSection(apiSettings.suno, request);
      const replacement: SunoReplacementResult = {
        taskId,
        sourceTaskId: request.sourceTaskId,
        sourceAudioId: request.sourceAudioId,
        infillStartS: request.infillStartS,
        infillEndS: request.infillEndS,
        prompt: request.prompt,
        tags: request.tags,
        title: request.title,
        status: 'SUBMITTED',
        message: 'Suno replacement task created. Check status after the service has processed it.',
        audioUrls: [],
        streamUrls: [],
        updatedAt: new Date().toISOString(),
      };

      setApiResults((current) => ({
        ...current,
        [track.id]: {
          ...current[track.id],
          sunoReplacements: [...(current[track.id]?.sunoReplacements ?? []), replacement],
        },
      }));
      setStatus(`Submitted replacement section for track ${track.id}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to replace the Suno section.');
    } finally {
      setApiBusy('');
    }
  }

  async function checkSunoReplacementStatus(trackId: number, taskId: string) {
    setApiBusy(`suno-replace-check-${trackId}-${taskId}`);
    setError('');
    try {
      const result = await getSunoSong(apiSettings.suno, taskId);
      setApiResults((current) => ({
        ...current,
        [trackId]: {
          ...current[trackId],
          sunoReplacements: (current[trackId]?.sunoReplacements ?? []).map((replacement) =>
            replacement.taskId === taskId
              ? {
                  ...replacement,
                  status: result.status,
                  message: result.message,
                  audioUrls: result.audioUrls,
                  streamUrls: result.streamUrls,
                  imageUrls: result.imageUrls,
                  tracks: result.tracks,
                  updatedAt: new Date().toISOString(),
                }
              : replacement,
          ),
        },
      }));
      setStatus(`Updated Suno replacement status for track ${trackId}: ${result.status}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to check Suno replacement status.');
    } finally {
      setApiBusy('');
    }
  }

  async function loadSunoCallbacks() {
    setApiBusy('suno-callbacks');
    setError('');
    try {
      const callbacks = await fetchSunoCallbacks(apiSettings.suno.callbackUrl);
      const callbacksByTaskId = new Map(callbacks.map((callback) => [callback.taskId, callback]));
      let matched = 0;

      setApiResults((current) => {
        const next = { ...current };
        Object.entries(current).forEach(([trackId, result]) => {
          const sunoTaskId = result.suno?.taskId;
          const sunoCallback = sunoTaskId ? callbacksByTaskId.get(sunoTaskId) : undefined;
          const replacementCallbacks = (result.sunoReplacements ?? []).map((replacement) => ({
            replacement,
            callback: callbacksByTaskId.get(replacement.taskId),
          }));
          if (!sunoCallback && replacementCallbacks.every((item) => !item.callback)) return;

          const callbackStatus = sunoCallback ? sunoCallbackToResult(sunoCallback) : null;
          if (callbackStatus) {
            matched += 1;
          }

          const sunoReplacements = replacementCallbacks.map(({ replacement, callback }) => {
            const replacementStatus = callback ? sunoCallbackToResult(callback) : null;
            if (!replacementStatus) return replacement;
            matched += 1;
            return {
              ...replacement,
              ...replacementStatus,
            };
          });

          next[Number(trackId)] = {
            ...result,
            suno:
              result.suno && callbackStatus
                ? {
                    ...result.suno,
                    ...callbackStatus,
                  }
                : result.suno,
            sunoReplacements: sunoReplacements.length ? sunoReplacements : result.sunoReplacements,
          };
        });
        return next;
      });

      setStatus(`Loaded ${callbacks.length} Suno callback record${callbacks.length === 1 ? '' : 's'}; matched ${matched}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Suno callback records.');
    } finally {
      setApiBusy('');
    }
  }

  async function loadKitsModels() {
    setApiBusy('kits-models');
    setError('');
    try {
      const models = await fetchKitsVoiceModels(apiSettings.kits);
      setVoiceModels(models);
      setStatus(`Loaded ${models.length} Kits voice models.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Kits voice models.');
    } finally {
      setApiBusy('');
    }
  }

  async function sendTrackToKits(trackId: number, file: File) {
    setApiBusy(`kits-${trackId}`);
    setError('');
    try {
      const result = await createKitsVoiceConversion(apiSettings.kits, file);
      setApiResults((current) => ({
        ...current,
        [trackId]: {
          ...current[trackId],
          kits: {
            conversionId: String(result.id),
            status: result.status,
            message: 'Kits voice conversion submitted.',
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      setStatus(`Submitted track ${trackId} audio to Kits AI.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit audio to Kits AI.');
    } finally {
      setApiBusy('');
    }
  }

  async function checkKitsStatus(trackId: number) {
    const conversionId = apiResults[trackId]?.kits?.conversionId;
    setApiBusy(`kits-check-${trackId}`);
    setError('');
    try {
      const result = await getKitsVoiceConversion(apiSettings.kits, conversionId ?? '');
      setApiResults((current) => ({
        ...current,
        [trackId]: {
          ...current[trackId],
          kits: {
            conversionId: String(result.id),
            status: result.status,
            message: 'Kits conversion status updated.',
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      setStatus(`Updated Kits status for track ${trackId}: ${result.status}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to check Kits status.');
    } finally {
      setApiBusy('');
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Anniversary Album Maker</p>
          <h1>Build a 13-song album plan for Robbin.</h1>
          <p className="hero-copy">
            Turn memories, places, private jokes, and tone into original lyrics drafts and AI music prompts. Everything
            runs locally and autosaves in your browser.
          </p>
        </div>
        <div className="hero-panel" aria-label="Album requirements">
          <span>13 tracks</span>
          <span>Original lyrics</span>
          <span>Local drafts</span>
        </div>
      </section>

      <section className="workspace">
        <form className="input-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Inputs</p>
              <h2>Your story details</h2>
            </div>
            <button type="button" className="ghost-button" onClick={resetDraft}>
              Clear
            </button>
          </div>

          <div className="field-grid two">
            <TextField
              label="Anniversary year or date"
              value={inputs.anniversary}
              placeholder="Example: 13th anniversary, June 8, 2026"
              onChange={(value) => updateInput('anniversary', value)}
            />
            <TextField
              label="Wife's name"
              value={inputs.wifeName}
              placeholder="Robbin"
              onChange={(value) => updateInput('wifeName', value)}
            />
            <TextField
              label="My name"
              value={inputs.myName}
              placeholder="Your name"
              onChange={(value) => updateInput('myName', value)}
            />
            <TextField
              label="Preferred genres"
              value={inputs.genres}
              placeholder="Acoustic pop, soul, folk, soft rock"
              onChange={(value) => updateInput('genres', value)}
            />
          </div>

          <TextArea
            label="Relationship memories"
            value={inputs.memories}
            placeholder={sampleMemories}
            onChange={(value) => updateInput('memories', value)}
          />
          <TextArea
            label="Important places"
            value={inputs.places}
            placeholder={samplePlaces}
            onChange={(value) => updateInput('places', value)}
          />
          <TextArea
            label="Inside jokes"
            value={inputs.insideJokes}
            placeholder={sampleJokes}
            onChange={(value) => updateInput('insideJokes', value)}
          />
          <TextArea
            label="Desired emotional tone"
            value={inputs.tone}
            placeholder="Tender, grateful, grown-up, hopeful, quietly romantic"
            onChange={(value) => updateInput('tone', value)}
          />
          <TextArea
            label="Custom lyric instructions"
            value={inputs.lyricInstructions}
            placeholder="Example: make every chorus end with infinity plus one, keep the verses bluesy and conversational, avoid direct references to hardship"
            onChange={(value) => updateInput('lyricInstructions', value)}
          />
          <div className="field-grid two">
            <TextArea
              label="Words or phrases to include"
              value={inputs.includeWords}
              placeholder="Always, home, your laugh"
              onChange={(value) => updateInput('includeWords', value)}
            />
            <TextArea
              label="Words or phrases to avoid"
              value={inputs.avoidWords}
              placeholder="Any private words you do not want used"
              onChange={(value) => updateInput('avoidWords', value)}
            />
          </div>

          <div className="action-row">
            <button type="button" className="primary-button" onClick={handleGenerate}>
              Generate album
            </button>
            <button type="button" className="secondary-button" onClick={handleRegenerateAlbum} disabled={!album}>
              Regenerate entire album
            </button>
          </div>

          <section className="sync-panel" aria-label="GitHub storage settings">
            <div>
              <p className="eyebrow">GitHub storage</p>
              <h2>Sync draft</h2>
              <p>
                Use a private repository and a fine-grained token with contents read/write access. The token is stored
                locally in this browser.
              </p>
            </div>
            <div className="field-grid two">
              <TextField
                label="Owner"
                value={githubSettings.owner}
                placeholder="GitHub username or org"
                onChange={(value) => updateGitHubSetting('owner', value)}
              />
              <TextField
                label="Repository"
                value={githubSettings.repo}
                placeholder="repo-name"
                onChange={(value) => updateGitHubSetting('repo', value)}
              />
              <TextField
                label="Branch"
                value={githubSettings.branch}
                placeholder="main"
                onChange={(value) => updateGitHubSetting('branch', value)}
              />
              <TextField
                label="File path"
                value={githubSettings.path}
                placeholder="anniversary-album-draft.json"
                onChange={(value) => updateGitHubSetting('path', value)}
              />
            </div>
            <label className="field">
              <span>GitHub token</span>
              <input
                type="password"
                value={githubSettings.token}
                placeholder="Fine-grained token with contents read/write access"
                onChange={(event) => updateGitHubSetting('token', event.target.value)}
              />
            </label>
            <div className="action-row">
              <button type="button" className="secondary-button" onClick={saveToGitHub} disabled={syncing}>
                Save to GitHub
              </button>
              <button type="button" className="ghost-button" onClick={loadFromGitHub} disabled={syncing}>
                Load from GitHub
              </button>
              <button type="button" className="ghost-button" onClick={copyDraftJson}>
                Copy draft JSON
              </button>
            </div>
            <TextArea
              label="Import draft JSON"
              value={importDraftText}
              placeholder="Paste exported draft JSON here"
              onChange={setImportDraftText}
            />
            <div className="action-row">
              <button type="button" className="ghost-button" onClick={importDraftJson} disabled={!importDraftText.trim()}>
                Import draft JSON
              </button>
              <button type="button" className="ghost-button" onClick={loadBundledDraft}>
                Load album.json
              </button>
            </div>
          </section>

          <section className="sync-panel" aria-label="Music API settings">
            <div>
              <p className="eyebrow">Music APIs</p>
              <h2>Suno and Kits AI</h2>
              <p>
                API keys are optional and stored locally. Suno creates full songs from each track plan; Kits AI converts
                uploaded vocal/audio files with a selected voice model.
              </p>
            </div>
            <label className="field">
              <span>Suno token</span>
              <input
                type="password"
                value={apiSettings.suno.token}
                placeholder="Suno API bearer token"
                onChange={(event) => updateSunoSetting('token', event.target.value)}
              />
            </label>
            <div className="field-grid two">
              <label className="field">
                <span>Suno model</span>
                <select
                  value={apiSettings.suno.model}
                  onChange={(event) => updateSunoSetting('model', event.target.value as ApiSettings['suno']['model'])}
                >
                  <option value="V5_5">V5_5</option>
                  <option value="V5">V5</option>
                  <option value="V4_5ALL">V4_5ALL</option>
                  <option value="V4_5PLUS">V4_5PLUS</option>
                  <option value="V4_5">V4_5</option>
                  <option value="V4">V4</option>
                </select>
              </label>
              <label className="field">
                <span>Vocal gender</span>
                <select
                  value={apiSettings.suno.vocalGender}
                  onChange={(event) => updateSunoSetting('vocalGender', event.target.value as '' | 'm' | 'f')}
                >
                  <option value="">No preference</option>
                  <option value="m">Male</option>
                  <option value="f">Female</option>
                </select>
              </label>
            </div>
            <TextField
              label="Suno callback URL"
              value={apiSettings.suno.callbackUrl}
              placeholder="Public URL ending in /api/suno/callback"
              onChange={(value) => updateSunoSetting('callbackUrl', value)}
            />
            <TextField
              label="Suno negative tags"
              value={apiSettings.suno.negativeTags}
              placeholder="Styles or traits to avoid"
              onChange={(value) => updateSunoSetting('negativeTags', value)}
            />
            <label className="check-field">
              <input
                type="checkbox"
                checked={apiSettings.suno.instrumental}
                onChange={(event) => updateSunoSetting('instrumental', event.target.checked)}
              />
              <span>Generate instrumental Suno tracks</span>
            </label>

            <label className="field">
              <span>Kits AI token</span>
              <input
                type="password"
                value={apiSettings.kits.token}
                placeholder="Kits AI bearer token"
                onChange={(event) => updateKitsSetting('token', event.target.value)}
              />
            </label>
            <div className="field-grid two">
              <TextField
                label="Kits voice model ID"
                value={apiSettings.kits.voiceModelId}
                placeholder="Example: 1014961"
                onChange={(value) => updateKitsSetting('voiceModelId', value)}
              />
              <TextField
                label="Pitch shift"
                value={apiSettings.kits.pitchShift}
                placeholder="-24 to 24"
                onChange={(value) => updateKitsSetting('pitchShift', value)}
              />
              <TextField
                label="Conversion strength"
                value={apiSettings.kits.conversionStrength}
                placeholder="0 to 1"
                onChange={(value) => updateKitsSetting('conversionStrength', value)}
              />
              <TextField
                label="Model volume mix"
                value={apiSettings.kits.modelVolumeMix}
                placeholder="0 to 1"
                onChange={(value) => updateKitsSetting('modelVolumeMix', value)}
              />
            </div>
            <div className="action-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => updateSunoSetting('callbackUrl', productionCallbackUrl())}
              >
                Use production callback
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => updateSunoSetting('callbackUrl', 'http://localhost:8787/api/suno/callback')}
              >
                Use local callback
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={loadSunoCallbacks}
                disabled={apiBusy === 'suno-callbacks'}
              >
                Load Suno callbacks
              </button>
              <button type="button" className="ghost-button" onClick={loadKitsModels} disabled={apiBusy === 'kits-models'}>
                Load Kits models
              </button>
            </div>
            {voiceModels.length ? (
              <div className="model-list">
                {voiceModels.map((model) => (
                  <button
                    type="button"
                    key={model.id}
                    onClick={() => updateKitsSetting('voiceModelId', String(model.id))}
                  >
                    {model.title} #{model.id}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
          {error ? <p className="error-message">{error}</p> : <p className="status-message">{status}</p>}
        </form>

        <section className="album-panel">
          {album ? (
            <>
              <div className="album-toolbar">
                <div>
                  <p className="eyebrow">Album plan</p>
                  <h2>{album.title}</h2>
                </div>
                <button type="button" className="ghost-button" onClick={handleRegenerateTitle}>
                  Regenerate title
                </button>
              </div>
              <p className="concept">{album.concept}</p>
              <div className="export-row">
                <button type="button" onClick={copyAlbum}>
                  Copy
                </button>
                <button type="button" onClick={exportMarkdown}>
                  Markdown
                </button>
                <button type="button" onClick={exportHtml}>
                  PDF-ready HTML
                </button>
                <button type="button" onClick={exportJson}>
                  JSON
                </button>
              </div>
              <div className="track-list">
                {album.tracks.map((track) => (
                  <div className="track-stack" key={track.id}>
                    <TrackCard
                      track={track}
                      onAction={handleTrackAction}
                      onEdit={updateTrackText}
                      onLyricsLockChange={setTrackLyricsLocked}
                    />
                    <ApiTrackPanel
                      track={track}
                      result={apiResults[track.id]}
                      busy={apiBusy}
                      onSunoGenerate={sendTrackToSuno}
                      onSunoCheck={checkSunoStatus}
                      onSunoReplace={replaceSunoTrackSection}
                      onSunoReplacementCheck={checkSunoReplacementStatus}
                      onKitsConvert={sendTrackToKits}
                      onKitsCheck={checkKitsStatus}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p className="eyebrow">Ready when you are</p>
              <h2>No album generated yet.</h2>
              <p>Add as many details as you have. Blank fields still produce a complete local draft.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function sunoCallbackToResult(callback: {
  code: number;
  msg: string;
  callbackType: string;
  receivedAt: string;
  tracks: SunoCallbackTrack[];
}) {
  const tracks = callback.tracks.map(callbackTrackToGeneratedTrack);
  return {
    status: callback.callbackType === 'complete' && callback.code === 200 ? 'CALLBACK_COMPLETE' : callback.callbackType,
    message: callback.msg,
    audioUrls: sunoAudioUrls(tracks),
    streamUrls: sunoStreamUrls(tracks),
    imageUrls: sunoImageUrls(tracks),
    tracks,
    updatedAt: callback.receivedAt,
  };
}

function callbackTrackToGeneratedTrack(track: SunoCallbackTrack): SunoGeneratedTrack {
  return {
    id: track.id,
    title: track.title,
    audioUrl: track.audioUrl,
    sourceAudioUrl: track.sourceAudioUrl,
    streamAudioUrl: track.streamAudioUrl,
    sourceStreamAudioUrl: track.sourceStreamAudioUrl,
    imageUrl: track.imageUrl,
    sourceImageUrl: track.sourceImageUrl,
    prompt: track.prompt,
    modelName: track.modelName,
    tags: track.tags,
    createTime: track.createTime,
    duration: track.duration,
  };
}

function sunoAudioUrls(tracks: SunoGeneratedTrack[]): string[] {
  return uniqueHttpUrls(tracks.flatMap((track) => [track.audioUrl, track.sourceAudioUrl]));
}

function sunoStreamUrls(tracks: SunoGeneratedTrack[]): string[] {
  return uniqueHttpUrls(tracks.flatMap((track) => [track.streamAudioUrl, track.sourceStreamAudioUrl]));
}

function sunoImageUrls(tracks: SunoGeneratedTrack[]): string[] {
  return uniqueHttpUrls(tracks.flatMap((track) => [track.imageUrl, track.sourceImageUrl]));
}

function displayAudioUrls(result?: { audioUrls: string[]; tracks?: SunoGeneratedTrack[] }): string[] {
  return result?.tracks?.length ? sunoAudioUrls(result.tracks) : uniqueHttpUrls(result?.audioUrls ?? []);
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

function audioTakeLabel(track: SunoGeneratedTrack, index: number): string {
  const duration = track.duration ? `, ${formatSeconds(track.duration)}` : '';
  const title = track.title ? `, ${track.title}` : '';
  return `Take ${index + 1}${duration}${title}`;
}

function formatSeconds(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}s`;
}

type FieldProps = {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

function TextField({ label, value, placeholder, onChange }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, placeholder, onChange }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} placeholder={placeholder} rows={4} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TrackCard({
  track,
  onAction,
  onEdit,
  onLyricsLockChange,
}: {
  track: SongPlan;
  onAction: (trackId: number, action: 'song' | 'lyrics' | 'prompt') => void;
  onEdit: (trackId: number, key: EditableTrackTextKey, value: string) => void;
  onLyricsLockChange: (trackId: number, lyricsLocked: boolean) => void;
}) {
  const [open, setOpen] = useState(track.id === 1);

  return (
    <article className="track-card">
      <header className="track-header">
        <div className="track-title-area">
          <button
            type="button"
            className="track-toggle"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} track ${track.id}`}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="track-number">{String(track.id).padStart(2, '0')}</span>
          </button>
          <div className="track-header-fields">
            <label className="inline-field">
              <span>Title</span>
              <input value={track.title} onChange={(event) => onEdit(track.id, 'title', event.target.value)} />
            </label>
            <label className="inline-field">
              <span>Genre</span>
              <input value={track.genreStyle} onChange={(event) => onEdit(track.id, 'genreStyle', event.target.value)} />
            </label>
          </div>
        </div>
        <div className="track-actions">
          <button type="button" onClick={() => onAction(track.id, 'song')}>
            Song
          </button>
          <button type="button" onClick={() => onAction(track.id, 'lyrics')}>
            Lyrics
          </button>
          <button type="button" onClick={() => onAction(track.id, 'prompt')}>
            Prompt
          </button>
        </div>
      </header>
      {open ? (
        <div className="track-body">
          <div className="metadata-grid">
            <TextArea
              label="Emotional purpose"
              value={track.emotionalPurpose}
              placeholder="What this track should express"
              onChange={(value) => onEdit(track.id, 'emotionalPurpose', value)}
            />
            <TextArea
              label="Description"
              value={track.shortDescription}
              placeholder="Track description"
              onChange={(value) => onEdit(track.id, 'shortDescription', value)}
            />
            <TextArea
              label="Dedication"
              value={track.dedicationNote}
              placeholder="Dedication note"
              onChange={(value) => onEdit(track.id, 'dedicationNote', value)}
            />
            <TextArea
              label="Vocal style"
              value={track.vocalStyle}
              placeholder="Vocal style"
              onChange={(value) => onEdit(track.id, 'vocalStyle', value)}
            />
            <TextArea
              label="Instrumentation"
              value={track.instrumentation}
              placeholder="Instrumentation"
              onChange={(value) => onEdit(track.id, 'instrumentation', value)}
            />
          </div>
          <section>
            <div className="section-heading">
              <div>
                <h3>Original lyrics draft</h3>
                <span className="lock-status">{track.lyricsLocked ? 'Locked' : 'Unlocked for editing'}</span>
              </div>
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => onLyricsLockChange(track.id, !track.lyricsLocked)}
              >
                {track.lyricsLocked ? 'Unlock lyrics' : 'Lock lyrics'}
              </button>
            </div>
            <textarea
              className="track-textarea lyrics-editor"
              aria-label={`Original lyrics draft for ${track.title}`}
              value={track.lyrics}
              readOnly={track.lyricsLocked}
              onChange={(event) => onEdit(track.id, 'lyrics', event.target.value)}
            />
          </section>
          <section>
            <h3>AI music tool prompt</h3>
            <textarea
              className="track-textarea prompt-editor"
              aria-label={`AI music tool prompt for ${track.title}`}
              value={track.musicPrompt}
              onChange={(event) => onEdit(track.id, 'musicPrompt', event.target.value)}
            />
          </section>
        </div>
      ) : null}
    </article>
  );
}

function ApiTrackPanel({
  track,
  result,
  busy,
  onSunoGenerate,
  onSunoCheck,
  onSunoReplace,
  onSunoReplacementCheck,
  onKitsConvert,
  onKitsCheck,
}: {
  track: SongPlan;
  result?: ApiResults[number];
  busy: string;
  onSunoGenerate: (track: SongPlan) => void;
  onSunoCheck: (trackId: number) => void;
  onSunoReplace: (track: SongPlan, request: SunoSectionReplacementInput) => void;
  onSunoReplacementCheck: (trackId: number, taskId: string) => void;
  onKitsConvert: (trackId: number, file: File) => void;
  onKitsCheck: (trackId: number) => void;
}) {
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceForm, setReplaceForm] = useState({
    sourceAudioId: '',
    infillStartS: '0',
    infillEndS: '6',
    prompt: '',
    tags: track.genreStyle,
    title: `${track.title} section fix`,
  });
  const sunoTracks = result?.suno?.tracks?.filter((item) => item.id) ?? [];
  const selectedSunoTrack = sunoTracks.find((item) => item.id === replaceForm.sourceAudioId) ?? sunoTracks[0];
  const firstAudioId = sunoTracks[0]?.id ?? '';
  const sunoAudioLinks = displayAudioUrls(result?.suno);

  useEffect(() => {
    if (!replaceForm.sourceAudioId && firstAudioId) {
      setReplaceForm((current) => ({ ...current, sourceAudioId: firstAudioId }));
    }
  }, [firstAudioId, replaceForm.sourceAudioId]);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      onKitsConvert(track.id, file);
      event.target.value = '';
    }
  }

  function updateReplaceForm(key: keyof typeof replaceForm, value: string) {
    setReplaceForm((current) => ({ ...current, [key]: value }));
  }

  function submitReplacement() {
    onSunoReplace(track, {
      sourceTaskId: result?.suno?.taskId ?? '',
      sourceAudioId: replaceForm.sourceAudioId,
      sourceDuration: selectedSunoTrack?.duration,
      infillStartS: Number.parseFloat(replaceForm.infillStartS),
      infillEndS: Number.parseFloat(replaceForm.infillEndS),
      prompt: replaceForm.prompt,
      tags: replaceForm.tags,
      title: replaceForm.title,
    });
  }

  return (
    <section className="api-track-panel" aria-label={`API actions for ${track.title}`}>
      <div className="api-service">
        <div>
          <strong>Suno</strong>
          <span>{result?.suno?.status ?? 'Not submitted'}</span>
        </div>
        <div className="track-actions">
          <button type="button" onClick={() => onSunoGenerate(track)} disabled={busy === `suno-${track.id}`}>
            Generate
          </button>
          <button
            type="button"
            onClick={() => onSunoCheck(track.id)}
            disabled={!result?.suno?.taskId || busy === `suno-check-${track.id}`}
          >
            Check
          </button>
          <button
            type="button"
            onClick={() => setReplaceOpen((current) => !current)}
            disabled={!result?.suno?.taskId}
          >
            Replace section
          </button>
        </div>
      </div>
      {result?.suno ? (
        <div className="api-result">
          <span>Task: {result.suno.taskId}</span>
          {sunoAudioLinks.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              Audio {index + 1}
            </a>
          ))}
          {!sunoAudioLinks.length && result.suno.status !== 'SUBMITTED' ? (
            <span>Audio file URL is not available yet; check status again or load callbacks.</span>
          ) : null}
        </div>
      ) : null}
      {replaceOpen ? (
        <div className="replace-panel">
          <div className="field-grid three">
            <label className="field">
              <span>Audio take</span>
              <select
                value={replaceForm.sourceAudioId}
                disabled={!sunoTracks.length}
                onChange={(event) => updateReplaceForm('sourceAudioId', event.target.value)}
              >
                {sunoTracks.length ? (
                  sunoTracks.map((item, index) => (
                    <option key={item.id} value={item.id}>
                      {audioTakeLabel(item, index)}
                    </option>
                  ))
                ) : (
                  <option value="">Check status to load audio IDs</option>
                )}
              </select>
            </label>
            <label className="field">
              <span>Start seconds</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={replaceForm.infillStartS}
                onChange={(event) => updateReplaceForm('infillStartS', event.target.value)}
              />
            </label>
            <label className="field">
              <span>End seconds</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={replaceForm.infillEndS}
                onChange={(event) => updateReplaceForm('infillEndS', event.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span>Replacement prompt</span>
            <textarea
              rows={4}
              value={replaceForm.prompt}
              placeholder="Correct the lyric here, including phonetic spelling if needed."
              onChange={(event) => updateReplaceForm('prompt', event.target.value)}
            />
          </label>
          <div className="field-grid two">
            <TextField
              label="Replacement tags"
              value={replaceForm.tags}
              placeholder="Blues, warm vocal, same arrangement"
              onChange={(value) => updateReplaceForm('tags', value)}
            />
            <TextField
              label="Replacement title"
              value={replaceForm.title}
              placeholder={`${track.title} section fix`}
              onChange={(value) => updateReplaceForm('title', value)}
            />
          </div>
          <div className="track-actions">
            <button
              type="button"
              onClick={submitReplacement}
              disabled={
                !result?.suno?.taskId ||
                !replaceForm.sourceAudioId ||
                !replaceForm.prompt.trim() ||
                busy === `suno-replace-${track.id}`
              }
            >
              Submit replacement
            </button>
          </div>
        </div>
      ) : null}
      {result?.sunoReplacements?.length ? (
        <div className="replacement-list">
          {result.sunoReplacements.map((replacement, index) => (
            <div className="api-result" key={replacement.taskId}>
              <span>Replacement {index + 1}: {replacement.status}</span>
              <span>
                {formatSeconds(replacement.infillStartS)}-{formatSeconds(replacement.infillEndS)}
              </span>
              <button
                type="button"
                onClick={() => onSunoReplacementCheck(track.id, replacement.taskId)}
                disabled={busy === `suno-replace-check-${track.id}-${replacement.taskId}`}
              >
                Check replacement
              </button>
              {displayAudioUrls(replacement).map((url, audioIndex) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  Replacement audio {audioIndex + 1}
                </a>
              ))}
              {!displayAudioUrls(replacement).length && replacement.status !== 'SUBMITTED' ? (
                <span>Replacement audio file URL is not available yet; check status again or load callbacks.</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="api-service">
        <div>
          <strong>Kits AI</strong>
          <span>{result?.kits?.status ?? 'No conversion'}</span>
        </div>
        <div className="track-actions">
          <label className="file-button">
            Convert audio
            <input type="file" accept=".wav,.mp3,.flac,audio/wav,audio/mpeg,audio/flac" onChange={handleFile} />
          </label>
          <button
            type="button"
            onClick={() => onKitsCheck(track.id)}
            disabled={!result?.kits?.conversionId || busy === `kits-check-${track.id}`}
          >
            Check
          </button>
        </div>
      </div>
      {result?.kits ? (
        <div className="api-result">
          <span>Conversion: {result.kits.conversionId}</span>
          <span>{result.kits.message}</span>
        </div>
      ) : null}
    </section>
  );
}
