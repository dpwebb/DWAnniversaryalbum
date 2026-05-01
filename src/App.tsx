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
      path: 'anniversary-album-session.json',
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
  const [status, setStatus] = useState('Your session is saved on this computer.');
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
      setStatus('Built a fresh 13-song studio session.');
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
    setStatus('Refreshed the album name.');
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
          ? `Refreshed song ${trackId} while keeping the protected lyrics.`
          : `Refreshed song ${trackId}.`
        : action === 'lyrics'
          ? `Rewrote lyrics for song ${trackId}.`
          : `Refreshed the Suno brief for song ${trackId}.`,
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
      setError('Use Edit lyrics before changing protected lyrics.');
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
    setStatus(lyricsLocked ? `Protected lyrics for song ${trackId}.` : `Lyrics for song ${trackId} are open for edits.`);
  }

  async function copyAlbum() {
    if (!album) return;
    try {
      await navigator.clipboard.writeText(albumToMarkdown(inputs, album));
      setStatus('Copied the session sheet.');
      setError('');
    } catch {
      setError('The browser blocked clipboard access. Use Download lyric sheet instead.');
    }
  }

  function exportMarkdown() {
    if (!album) return;
    downloadText('anniversary-album-plan.md', albumToMarkdown(inputs, album), 'text/markdown;charset=utf-8');
    setStatus('Downloaded the lyric sheet.');
  }

  function exportHtml() {
    if (!album) return;
    downloadText('anniversary-album-plan.html', albumToHtml(inputs, album), 'text/html;charset=utf-8');
    setStatus('Downloaded the print-ready page.');
  }

  function exportJson() {
    if (!album) return;
    downloadText(
      'anniversary-album-plan.json',
      JSON.stringify(currentDraft(), null, 2),
      'application/json;charset=utf-8',
    );
    setStatus('Downloaded the backup file.');
  }

  async function copyDraftJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentDraft(), null, 2));
      setStatus('Copied the backup text.');
      setError('');
    } catch {
      setError('The browser blocked clipboard access.');
    }
  }

  function importDraftJson() {
    try {
      const parsed = JSON.parse(importDraftText) as Partial<DraftState> & {
        inputs?: Partial<AlbumInputs>;
        album?: AlbumPlan | null;
      };
      if (!parsed.inputs) {
        throw new Error('Backup text is missing the story notes.');
      }

      applyDraft({ ...parsed, inputs: parsed.inputs });
      setImportDraftText('');
      setStatus('Restored the backup text.');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to restore that backup text.');
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
    setStatus('Loaded the saved album session.');
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
    setStatus('Started a clean session.');
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
      setStatus(`Saved this session to ${githubSettings.owner}/${githubSettings.repo}/${githubSettings.path}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this session.');
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
      setStatus(`Loaded your session from ${githubSettings.owner}/${githubSettings.repo}/${githubSettings.path}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load that saved session.');
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
            message: 'Suno is making this song. Refresh results in a bit.',
            audioUrls: [],
            streamUrls: [],
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      setStatus(`Sent song ${track.id} to Suno.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send this song to Suno.');
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
      setStatus(`Refreshed Suno results for song ${trackId}: ${friendlyStatus(result.status)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh Suno results.');
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
        message: 'Suno is making this fix. Refresh results in a bit.',
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
      setStatus(`Sent a section fix for song ${track.id}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send that section fix.');
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
      setStatus(`Refreshed the Suno fix for song ${trackId}: ${friendlyStatus(result.status)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh that Suno fix.');
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

      setStatus(
        `Brought in ${callbacks.length} finished Suno update${callbacks.length === 1 ? '' : 's'} and found ${matched} song match${matched === 1 ? '' : 'es'}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to bring in finished Suno songs.');
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
      setStatus(`Loaded ${models.length} voice preset${models.length === 1 ? '' : 's'}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load voice presets.');
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
            message: 'Voice pass sent.',
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      setStatus(`Sent song ${trackId} audio to the voice tool.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send audio to the voice tool.');
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
            message: 'Voice pass refreshed.',
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      setStatus(`Refreshed voice results for song ${trackId}: ${friendlyStatus(result.status)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh voice results.');
    } finally {
      setApiBusy('');
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Anniversary Music Studio</p>
          <h1>Shape Robbin's 13-song anniversary album.</h1>
          <p className="hero-copy">
            Move from story notes to protected lyrics, Suno-ready song briefs, and finished audio takes in one focused
            studio workspace.
          </p>
        </div>
        <div className="hero-panel" aria-label="Session snapshot">
          <div className="studio-meter" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span>13-song session</span>
          <span>Lyrics you approve</span>
          <span>Ready for Suno</span>
        </div>
      </section>

      <section className="workspace">
        <form className="input-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Session Notes</p>
              <h2>Source material</h2>
            </div>
            <button type="button" className="ghost-button" onClick={resetDraft}>
              Start over
            </button>
          </div>

          <div className="field-grid two">
            <TextField
              label="Anniversary date"
              value={inputs.anniversary}
              placeholder="Example: 13th anniversary, June 8, 2026"
              onChange={(value) => updateInput('anniversary', value)}
            />
            <TextField
              label="Her name"
              value={inputs.wifeName}
              placeholder="Robbin"
              onChange={(value) => updateInput('wifeName', value)}
            />
            <TextField
              label="From"
              value={inputs.myName}
              placeholder="Your name"
              onChange={(value) => updateInput('myName', value)}
            />
            <TextField
              label="Sound"
              value={inputs.genres}
              placeholder="Acoustic pop, soul, folk, soft rock"
              onChange={(value) => updateInput('genres', value)}
            />
          </div>

          <TextArea
            label="Story notes"
            value={inputs.memories}
            placeholder={sampleMemories}
            onChange={(value) => updateInput('memories', value)}
          />
          <TextArea
            label="Places"
            value={inputs.places}
            placeholder={samplePlaces}
            onChange={(value) => updateInput('places', value)}
          />
          <TextArea
            label="Private lines and jokes"
            value={inputs.insideJokes}
            placeholder={sampleJokes}
            onChange={(value) => updateInput('insideJokes', value)}
          />
          <TextArea
            label="Feeling"
            value={inputs.tone}
            placeholder="Tender, grateful, grown-up, hopeful, quietly romantic"
            onChange={(value) => updateInput('tone', value)}
          />
          <TextArea
            label="Lyric notes"
            value={inputs.lyricInstructions}
            placeholder="Example: make every chorus end with infinity plus one, keep the verses bluesy and conversational, avoid direct references to hardship"
            onChange={(value) => updateInput('lyricInstructions', value)}
          />
          <div className="field-grid two">
            <TextArea
              label="Must-use words"
              value={inputs.includeWords}
              placeholder="Always, home, your laugh"
              onChange={(value) => updateInput('includeWords', value)}
            />
            <TextArea
              label="Words to leave out"
              value={inputs.avoidWords}
              placeholder="Any private words you do not want used"
              onChange={(value) => updateInput('avoidWords', value)}
            />
          </div>

          <div className="action-row">
            <button type="button" className="primary-button" onClick={handleGenerate}>
              Build songs
            </button>
            <button type="button" className="secondary-button" onClick={handleRegenerateAlbum} disabled={!album}>
              Refresh all songs
            </button>
          </div>

          <section className="sync-panel" aria-label="Save settings">
            <div>
              <p className="eyebrow">Backup</p>
              <h2>Save your session</h2>
              <p>
                Keep a private copy of your session in GitHub. Your access key stays in this browser on this computer.
              </p>
            </div>
            <div className="field-grid two">
              <TextField
                label="GitHub name"
                value={githubSettings.owner}
                placeholder="GitHub username or org"
                onChange={(value) => updateGitHubSetting('owner', value)}
              />
              <TextField
                label="GitHub project"
                value={githubSettings.repo}
                placeholder="repo-name"
                onChange={(value) => updateGitHubSetting('repo', value)}
              />
              <TextField
                label="Save lane"
                value={githubSettings.branch}
                placeholder="main"
                onChange={(value) => updateGitHubSetting('branch', value)}
              />
              <TextField
                label="Save file"
                value={githubSettings.path}
                placeholder="anniversary-album-session"
                onChange={(value) => updateGitHubSetting('path', value)}
              />
            </div>
            <label className="field">
              <span>GitHub access key</span>
              <input
                type="password"
                value={githubSettings.token}
                placeholder="Private access key for saving this session"
                onChange={(event) => updateGitHubSetting('token', event.target.value)}
              />
            </label>
            <div className="action-row">
              <button type="button" className="secondary-button" onClick={saveToGitHub} disabled={syncing}>
                Save session
              </button>
              <button type="button" className="ghost-button" onClick={loadFromGitHub} disabled={syncing}>
                Load session
              </button>
              <button type="button" className="ghost-button" onClick={copyDraftJson}>
                Copy backup text
              </button>
            </div>
            <TextArea
              label="Restore from backup text"
              value={importDraftText}
              placeholder="Paste backup text here"
              onChange={setImportDraftText}
            />
            <div className="action-row">
              <button type="button" className="ghost-button" onClick={importDraftJson} disabled={!importDraftText.trim()}>
                Restore backup
              </button>
              <button type="button" className="ghost-button" onClick={loadBundledDraft}>
                Load saved album
              </button>
            </div>
          </section>

          <section className="sync-panel" aria-label="Music service settings">
            <div>
              <p className="eyebrow">Music Services</p>
              <h2>Suno and voice tools</h2>
              <p>
                Add service keys when you want this studio to send songs to Suno or create a voice pass from uploaded
                audio.
              </p>
            </div>
            <label className="field">
              <span>Suno access key</span>
              <input
                type="password"
                value={apiSettings.suno.token}
                placeholder="Private Suno access key"
                onChange={(event) => updateSunoSetting('token', event.target.value)}
              />
            </label>
            <div className="field-grid two">
              <label className="field">
                <span>Suno version</span>
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
                <span>Voice</span>
                <select
                  value={apiSettings.suno.vocalGender}
                  onChange={(event) => updateSunoSetting('vocalGender', event.target.value as '' | 'm' | 'f')}
                >
                  <option value="">Any voice</option>
                  <option value="m">Male</option>
                  <option value="f">Female</option>
                </select>
              </label>
            </div>
            <TextField
              label="Finished-song return address"
              value={apiSettings.suno.callbackUrl}
              placeholder="Web address where finished songs come back"
              onChange={(value) => updateSunoSetting('callbackUrl', value)}
            />
            <TextField
              label="Sounds to avoid"
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
              <span>Make instrumental tracks</span>
            </label>

            <label className="field">
              <span>Voice tool access key</span>
              <input
                type="password"
                value={apiSettings.kits.token}
                placeholder="Private voice tool access key"
                onChange={(event) => updateKitsSetting('token', event.target.value)}
              />
            </label>
            <div className="field-grid two">
              <TextField
                label="Voice preset number"
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
                label="Voice match"
                value={apiSettings.kits.conversionStrength}
                placeholder="0 to 1"
                onChange={(value) => updateKitsSetting('conversionStrength', value)}
              />
              <TextField
                label="Voice blend"
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
                Use live return address
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => updateSunoSetting('callbackUrl', 'http://localhost:8787/api/suno/callback')}
              >
                Use this computer
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={loadSunoCallbacks}
                disabled={apiBusy === 'suno-callbacks'}
              >
                Bring in finished songs
              </button>
              <button type="button" className="ghost-button" onClick={loadKitsModels} disabled={apiBusy === 'kits-models'}>
                Find voice presets
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
                  <p className="eyebrow">Session Board</p>
                  <h2>{album.title}</h2>
                </div>
                <button type="button" className="ghost-button" onClick={handleRegenerateTitle}>
                  Refresh album name
                </button>
              </div>
              <p className="concept">{album.concept}</p>
              <div className="export-row">
                <button type="button" onClick={copyAlbum}>
                  Copy
                </button>
                <button type="button" onClick={exportMarkdown}>
                  Lyric sheet
                </button>
                <button type="button" onClick={exportHtml}>
                  Print page
                </button>
                <button type="button" onClick={exportJson}>
                  Backup file
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
              <p className="eyebrow">Studio Waiting</p>
              <h2>No songs on the board yet.</h2>
              <p>Add whatever story notes you have. Empty spaces still produce a complete first pass.</p>
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

function friendlyStatus(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (!normalized) return 'Waiting';
  if (['SUBMITTED', 'PENDING', 'QUEUED', 'CREATE_TASK', 'TEXT_SUCCESS'].includes(normalized)) return 'In progress';
  if (['SUCCESS', 'COMPLETE', 'COMPLETED', 'CALLBACK_COMPLETE'].includes(normalized)) return 'Ready';
  if (['FAILED', 'ERROR'].includes(normalized)) return 'Needs attention';
  if (normalized === 'UNKNOWN') return 'Waiting';
  return status.replace(/_/g, ' ').toLowerCase();
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
            Refresh song
          </button>
          <button type="button" onClick={() => onAction(track.id, 'lyrics')}>
            Rewrite lyrics
          </button>
          <button type="button" onClick={() => onAction(track.id, 'prompt')}>
            Refresh brief
          </button>
        </div>
      </header>
      {open ? (
        <div className="track-body">
          <div className="metadata-grid">
            <TextArea
              label="Feeling"
              value={track.emotionalPurpose}
              placeholder="What this track should express"
              onChange={(value) => onEdit(track.id, 'emotionalPurpose', value)}
            />
            <TextArea
              label="Story"
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
              label="Voice direction"
              value={track.vocalStyle}
              placeholder="Vocal style"
              onChange={(value) => onEdit(track.id, 'vocalStyle', value)}
            />
            <TextArea
              label="Arrangement"
              value={track.instrumentation}
              placeholder="Instrumentation"
              onChange={(value) => onEdit(track.id, 'instrumentation', value)}
            />
          </div>
          <section>
            <div className="section-heading">
              <div>
                <h3>Approved lyric draft</h3>
                <span className="lock-status">{track.lyricsLocked ? 'Protected' : 'Open for edits'}</span>
              </div>
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => onLyricsLockChange(track.id, !track.lyricsLocked)}
              >
                {track.lyricsLocked ? 'Edit lyrics' : 'Protect lyrics'}
              </button>
            </div>
            <textarea
              className="track-textarea lyrics-editor"
              aria-label={`Approved lyric draft for ${track.title}`}
              value={track.lyrics}
              readOnly={track.lyricsLocked}
              onChange={(event) => onEdit(track.id, 'lyrics', event.target.value)}
            />
          </section>
          <section>
            <h3>Music brief for Suno</h3>
            <textarea
              className="track-textarea prompt-editor"
              aria-label={`Music brief for Suno for ${track.title}`}
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
          <span>{result?.suno?.status ? friendlyStatus(result.suno.status) : 'Not sent'}</span>
        </div>
        <div className="track-actions">
          <button type="button" onClick={() => onSunoGenerate(track)} disabled={busy === `suno-${track.id}`}>
            Send to Suno
          </button>
          <button
            type="button"
            onClick={() => onSunoCheck(track.id)}
            disabled={!result?.suno?.taskId || busy === `suno-check-${track.id}`}
          >
            Refresh results
          </button>
          <button
            type="button"
            onClick={() => setReplaceOpen((current) => !current)}
            disabled={!result?.suno?.taskId}
          >
            Fix section
          </button>
        </div>
      </div>
      {result?.suno ? (
        <div className="api-result">
          <span>Suno reference: {result.suno.taskId}</span>
          {sunoAudioLinks.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              Audio {index + 1}
            </a>
          ))}
          {!sunoAudioLinks.length && result.suno.status !== 'SUBMITTED' ? (
            <span>Finished audio is not ready yet. Refresh results or bring in finished songs.</span>
          ) : null}
        </div>
      ) : null}
      {replaceOpen ? (
        <div className="replace-panel">
          <div className="field-grid three">
            <label className="field">
              <span>Finished take</span>
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
                  <option value="">Refresh results to load takes</option>
                )}
              </select>
            </label>
            <label className="field">
              <span>Fix starts at</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={replaceForm.infillStartS}
                onChange={(event) => updateReplaceForm('infillStartS', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Fix ends at</span>
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
            <span>Corrected lyric or direction</span>
            <textarea
              rows={4}
              value={replaceForm.prompt}
              placeholder="Correct the lyric here, including phonetic spelling if needed."
              onChange={(event) => updateReplaceForm('prompt', event.target.value)}
            />
          </label>
          <div className="field-grid two">
            <TextField
              label="Sound notes"
              value={replaceForm.tags}
              placeholder="Blues, warm vocal, same arrangement"
              onChange={(value) => updateReplaceForm('tags', value)}
            />
            <TextField
              label="Fix name"
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
              Send fix
            </button>
          </div>
        </div>
      ) : null}
      {result?.sunoReplacements?.length ? (
        <div className="replacement-list">
          {result.sunoReplacements.map((replacement, index) => (
            <div className="api-result" key={replacement.taskId}>
              <span>Fix {index + 1}: {friendlyStatus(replacement.status)}</span>
              <span>
                {formatSeconds(replacement.infillStartS)}-{formatSeconds(replacement.infillEndS)}
              </span>
              <button
                type="button"
                onClick={() => onSunoReplacementCheck(track.id, replacement.taskId)}
                disabled={busy === `suno-replace-check-${track.id}-${replacement.taskId}`}
              >
                Refresh fix
              </button>
              {displayAudioUrls(replacement).map((url, audioIndex) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  Fixed audio {audioIndex + 1}
                </a>
              ))}
              {!displayAudioUrls(replacement).length && replacement.status !== 'SUBMITTED' ? (
                <span>Fixed audio is not ready yet. Refresh the fix or bring in finished songs.</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="api-service">
        <div>
          <strong>Voice tool</strong>
          <span>{result?.kits?.status ? friendlyStatus(result.kits.status) : 'No voice pass'}</span>
        </div>
        <div className="track-actions">
          <label className="file-button">
            Change voice
            <input type="file" accept=".wav,.mp3,.flac,audio/wav,audio/mpeg,audio/flac" onChange={handleFile} />
          </label>
          <button
            type="button"
            onClick={() => onKitsCheck(track.id)}
            disabled={!result?.kits?.conversionId || busy === `kits-check-${track.id}`}
          >
            Refresh
          </button>
        </div>
      </div>
      {result?.kits ? (
        <div className="api-result">
          <span>Voice reference: {result.kits.conversionId}</span>
          <span>{result.kits.message}</span>
        </div>
      ) : null}
    </section>
  );
}
