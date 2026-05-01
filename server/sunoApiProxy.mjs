const SUNO_BASE_URL = 'https://api.sunoapi.org/api/v1';

export async function handleSunoApiProxy(req, res, url, readJsonBody) {
  try {
    if (req.method === 'POST' && url.pathname === '/api/suno/generate') {
      await proxySunoPost(req, res, '/generate', readJsonBody);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/suno/generate/replace-section') {
      await proxySunoPost(req, res, '/generate/replace-section', readJsonBody);
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/suno/generate/record-info') {
      await proxySunoRecordInfo(req, res, url);
      return true;
    }
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 502;
    sendJson(res, status, { error: error instanceof Error ? error.message : 'Unable to reach Suno.' });
    return true;
  }

  return false;
}

async function proxySunoPost(req, res, pathname, readJsonBody) {
  const body = await readJsonBody(req);
  await forwardSunoRequest(res, `${SUNO_BASE_URL}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: sunoAuthorization(req),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function proxySunoRecordInfo(req, res, requestUrl) {
  const taskId = requestUrl.searchParams.get('taskId')?.trim() ?? '';
  if (!taskId) {
    throw httpError(400, 'Suno task ID is required.');
  }

  const upstreamUrl = new URL(`${SUNO_BASE_URL}/generate/record-info`);
  upstreamUrl.searchParams.set('taskId', taskId);

  await forwardSunoRequest(res, upstreamUrl, {
    headers: {
      Authorization: sunoAuthorization(req),
    },
  });
}

async function forwardSunoRequest(res, url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let response;
  let text;

  try {
    response = await fetch(url, { ...init, signal: controller.signal });
    text = await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw httpError(504, 'Timed out waiting for Suno. Try again in a minute.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  res.statusCode = response.status;
  res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json; charset=utf-8');
  return res.end(text || '{}');
}

function sunoAuthorization(req) {
  const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';

  if (!token) {
    throw httpError(401, 'Suno API token is required.');
  }

  return `Bearer ${token}`;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(payload));
}
