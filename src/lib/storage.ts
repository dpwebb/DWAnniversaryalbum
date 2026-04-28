import type { ApiSettings, DraftState, GitHubStorageSettings } from '../types';

const STORAGE_KEY = 'anniversary-album-maker:draft';
const GITHUB_SETTINGS_KEY = 'anniversary-album-maker:github-settings';
const API_SETTINGS_KEY = 'anniversary-album-maker:api-settings';

export function loadDraft(): DraftState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DraftState) : null;
  } catch (error) {
    console.warn('Unable to load saved draft', error);
    return null;
  }
}

export function saveDraft(draft: DraftState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn('Unable to save draft', error);
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Unable to clear draft', error);
  }
}

export function loadGitHubSettings(): GitHubStorageSettings | null {
  try {
    const raw = window.localStorage.getItem(GITHUB_SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as GitHubStorageSettings) : null;
  } catch (error) {
    console.warn('Unable to load GitHub settings', error);
    return null;
  }
}

export function saveGitHubSettings(settings: GitHubStorageSettings): void {
  try {
    window.localStorage.setItem(GITHUB_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Unable to save GitHub settings', error);
  }
}

export function loadApiSettings(): ApiSettings | null {
  try {
    const raw = window.localStorage.getItem(API_SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as ApiSettings) : null;
  } catch (error) {
    console.warn('Unable to load API settings', error);
    return null;
  }
}

export function saveApiSettings(settings: ApiSettings): void {
  try {
    window.localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Unable to save API settings', error);
  }
}
