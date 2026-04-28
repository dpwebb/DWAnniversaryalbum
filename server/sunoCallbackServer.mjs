import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const callbackFile = join(dataDir, 'suno-callbacks.json');
const port = Number.parseInt(process.env.SUNO_CALLBACK_PORT ?? '8787', 10);

const server = createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, null);
  }

  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, service: 'suno-callback-server' });
    }

    if (req.method === 'POST' && url.pathname === '/api/suno/callback') {
      const body = await readJsonBody(req);
      const record = normalizeSunoCallback(body);
      const callbacks = await readCallbacks();
      const filtered = callbacks.filter(
        (item) => !(item.taskId === record.taskId && item.callbackType === record.callbackType),
      );
      filtered.push(record);
      await writeCallbacks(filtered);
      return sendJson(res, 200, { status: 'received' });
    }

    if (req.method === 'GET' && url.pathname === '/api/suno/callbacks') {
      const callbacks = await readCallbacks();
      const taskId = url.searchParams.get('taskId');
      return sendJson(
        res,
        200,
        taskId ? callbacks.filter((callback) => callback.taskId === taskId) : callbacks,
      );
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown server error' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Suno callback server listening on http://localhost:${port}`);
  console.log(`Callback endpoint: http://localhost:${port}/api/suno/callback`);
});

function normalizeSunoCallback(body) {
  const payload = body?.data ?? {};
  const tracks = Array.isArray(payload.data) ? payload.data : [];

  return {
    receivedAt: new Date().toISOString(),
    code: Number(body?.code ?? 0),
    msg: String(body?.msg ?? ''),
    taskId: String(payload.task_id ?? payload.taskId ?? ''),
    callbackType: String(payload.callbackType ?? 'unknown'),
    tracks: tracks.map((track) => ({
      id: stringOrEmpty(track.id),
      title: stringOrEmpty(track.title),
      audioUrl: stringOrEmpty(track.audio_url),
      sourceAudioUrl: stringOrEmpty(track.source_audio_url),
      streamAudioUrl: stringOrEmpty(track.stream_audio_url),
      sourceStreamAudioUrl: stringOrEmpty(track.source_stream_audio_url),
      imageUrl: stringOrEmpty(track.image_url),
      sourceImageUrl: stringOrEmpty(track.source_image_url),
      prompt: stringOrEmpty(track.prompt),
      modelName: stringOrEmpty(track.model_name),
      tags: stringOrEmpty(track.tags),
      createTime: stringOrEmpty(track.createTime),
      duration: typeof track.duration === 'number' ? track.duration : null,
    })),
    raw: body,
  };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) {
      throw new Error('Callback payload is too large.');
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function readCallbacks() {
  try {
    const raw = await readFile(callbackFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeCallbacks(callbacks) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(callbackFile, JSON.stringify(callbacks, null, 2), 'utf8');
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  if (payload === null) {
    return res.end();
  }
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(payload));
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : '';
}
