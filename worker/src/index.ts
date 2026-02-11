interface Env {
  DB: D1Database;
  SYNC_TOKEN: string;
}

interface PushChange {
  entity: string;
  entityId: string;
  operation: string;
  payload: string;
  timestamp: string;
}

interface PushRequest {
  changes: PushChange[];
}

const VALID_ENTITIES = [
  'meeting',
  'stakeholder',
  'stakeholderCategory',
  'transcript',
  'meetingAnalysis',
];

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function authenticate(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  return token === env.SYNC_TOKEN;
}

async function handlePush(request: Request, env: Env): Promise<Response> {
  let body: PushRequest;
  try {
    body = await request.json() as PushRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.changes || !Array.isArray(body.changes)) {
    return errorResponse('Missing "changes" array', 400);
  }

  let processed = 0;
  let skipped = 0;

  for (const change of body.changes) {
    if (!change.entity || !change.entityId || !change.timestamp) {
      skipped++;
      continue;
    }

    if (!VALID_ENTITIES.includes(change.entity)) {
      skipped++;
      continue;
    }

    // Check if existing record is newer
    const existing = await env.DB.prepare(
      'SELECT updated_at FROM records WHERE entity = ? AND entity_id = ?'
    )
      .bind(change.entity, change.entityId)
      .first<{ updated_at: string }>();

    if (existing && existing.updated_at >= change.timestamp) {
      skipped++;
      continue;
    }

    // Upsert: incoming is newer or record doesn't exist
    await env.DB.prepare(
      'INSERT OR REPLACE INTO records (entity, entity_id, payload, updated_at) VALUES (?, ?, ?, ?)'
    )
      .bind(change.entity, change.entityId, change.payload, change.timestamp)
      .run();

    processed++;
  }

  return jsonResponse({ processed, skipped });
}

async function handlePull(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const since = url.searchParams.get('since');

  let rows: { entity: string; entity_id: string; payload: string; updated_at: string }[];

  if (since) {
    const result = await env.DB.prepare(
      'SELECT entity, entity_id, payload, updated_at FROM records WHERE updated_at > ? ORDER BY updated_at'
    )
      .bind(since)
      .all();
    rows = result.results as typeof rows;
  } else {
    const result = await env.DB.prepare(
      'SELECT entity, entity_id, payload, updated_at FROM records ORDER BY updated_at'
    ).all();
    rows = result.results as typeof rows;
  }

  // Group by entity type and parse payload JSON
  const grouped: Record<string, unknown[]> = {
    meetings: [],
    stakeholders: [],
    stakeholderCategories: [],
    transcripts: [],
    meetingAnalyses: [],
  };

  const entityToKey: Record<string, string> = {
    meeting: 'meetings',
    stakeholder: 'stakeholders',
    stakeholderCategory: 'stakeholderCategories',
    transcript: 'transcripts',
    meetingAnalysis: 'meetingAnalyses',
  };

  for (const row of rows) {
    const key = entityToKey[row.entity];
    if (key) {
      try {
        grouped[key].push(JSON.parse(row.payload));
      } catch {
        // Skip records with invalid JSON payload
      }
    }
  }

  return jsonResponse(grouped);
}

async function handleStatus(env: Env): Promise<Response> {
  const counts: Record<string, number> = {};

  for (const entity of VALID_ENTITIES) {
    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM records WHERE entity = ?'
    )
      .bind(entity)
      .first<{ count: number }>();
    const key = entity === 'meeting' ? 'meetings'
      : entity === 'stakeholder' ? 'stakeholders'
      : entity === 'stakeholderCategory' ? 'stakeholderCategories'
      : entity === 'transcript' ? 'transcripts'
      : 'meetingAnalyses';
    counts[key] = result?.count ?? 0;
  }

  const last = await env.DB.prepare(
    'SELECT updated_at FROM records ORDER BY updated_at DESC LIMIT 1'
  ).first<{ updated_at: string }>();

  return jsonResponse({
    ok: true,
    counts,
    lastUpdated: last?.updated_at ?? null,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Authenticate all non-OPTIONS requests
    if (!authenticate(request, env)) {
      return errorResponse('Unauthorized', 401);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path === '/push') {
      return handlePush(request, env);
    }

    if (request.method === 'GET' && path === '/pull') {
      return handlePull(request, env);
    }

    if (request.method === 'GET' && path === '/status') {
      return handleStatus(env);
    }

    return errorResponse('Not found', 404);
  },
};
