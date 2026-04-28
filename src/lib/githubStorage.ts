import type { DraftState, GitHubStorageSettings } from '../types';

type GitHubContentResponse = {
  sha: string;
  content?: string;
  encoding?: string;
};

const API_BASE = 'https://api.github.com';

export async function loadDraftFromGitHub(settings: GitHubStorageSettings): Promise<DraftState> {
  const response = await githubFetch(settings, contentUrl(settings, true), {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(await githubErrorMessage(response, 'Unable to load draft from GitHub.'));
  }

  const payload = (await response.json()) as GitHubContentResponse;
  if (!payload.content || payload.encoding !== 'base64') {
    throw new Error('GitHub file did not contain readable base64 content.');
  }

  return JSON.parse(decodeBase64(payload.content)) as DraftState;
}

export async function saveDraftToGitHub(settings: GitHubStorageSettings, draft: DraftState): Promise<void> {
  const existingSha = await getExistingSha(settings);
  const response = await githubFetch(settings, contentUrl(settings, false), {
    method: 'PUT',
    body: JSON.stringify({
      message: `Save anniversary album draft ${new Date().toISOString()}`,
      content: encodeBase64(JSON.stringify(draft, null, 2)),
      branch: settings.branch || undefined,
      sha: existingSha,
    }),
  });

  if (!response.ok) {
    throw new Error(await githubErrorMessage(response, 'Unable to save draft to GitHub.'));
  }
}

export function validateGitHubSettings(settings: GitHubStorageSettings): string | null {
  if (!settings.owner.trim()) return 'GitHub owner is required.';
  if (!settings.repo.trim()) return 'GitHub repository is required.';
  if (!settings.path.trim()) return 'GitHub file path is required.';
  if (!settings.token.trim()) return 'A GitHub fine-grained token is required for browser sync.';
  return null;
}

async function getExistingSha(settings: GitHubStorageSettings): Promise<string | undefined> {
  const response = await githubFetch(settings, contentUrl(settings, true), {
    method: 'GET',
  });

  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(await githubErrorMessage(response, 'Unable to inspect existing GitHub draft.'));
  }

  const payload = (await response.json()) as GitHubContentResponse;
  return payload.sha;
}

function githubFetch(settings: GitHubStorageSettings, url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${settings.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  });
}

function contentUrl(settings: GitHubStorageSettings, includeRef: boolean): string {
  const normalizedPath = settings.path.replace(/^\/+/, '');
  const url = new URL(
    `${API_BASE}/repos/${encodeURIComponent(settings.owner.trim())}/${encodeURIComponent(
      settings.repo.trim(),
    )}/contents/${normalizedPath
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`,
  );

  if (includeRef && settings.branch.trim()) {
    url.searchParams.set('ref', settings.branch.trim());
  }

  return url.toString();
}

async function githubErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ? `${fallback} GitHub says: ${payload.message}` : fallback;
  } catch {
    return fallback;
  }
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const clean = value.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
