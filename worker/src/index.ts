interface Env {
  DB: D1Database;
  SYNC_TOKEN: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
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

interface TaskFlowTask {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  owner: string;
  deadline: string;
  followUpTarget: string;
  sourceMeetingTitle: string;
  sourceMeetingId: string;
  stakeholderIds: string[];
  stakeholderNames: string[];
  stakeholderCategories: string[];
  createdAt: string;
  updatedAt: string;
}

async function handleTaskFlowPush(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return errorResponse('TaskFlow integration not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY Worker secrets.', 500);
  }

  let body: { tasks: TaskFlowTask[] };
  try {
    body = await request.json() as { tasks: TaskFlowTask[] };
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.tasks || !Array.isArray(body.tasks) || body.tasks.length === 0) {
    return errorResponse('Missing or empty "tasks" array', 400);
  }

  // Transform camelCase → snake_case for Supabase columns
  const rows = body.tasks.map((t) => ({
    id: t.id,
    source: 'smartmeetings',
    title: t.title,
    description: t.description || null,
    type: t.type,
    priority: t.priority,
    status: t.status,
    owner: t.owner || null,
    deadline: t.deadline || null,
    follow_up_target: t.followUpTarget || null,
    source_meeting_title: t.sourceMeetingTitle || null,
    source_meeting_id: t.sourceMeetingId || null,
    sm_stakeholder_id:       t.stakeholderIds?.length === 1 ? t.stakeholderIds[0] : null,
    sm_stakeholder_name:     t.stakeholderNames?.length === 1 ? t.stakeholderNames[0] : null,
    sm_stakeholder_category: t.stakeholderCategories?.length === 1 ? t.stakeholderCategories[0] : null,
    sm_created_at: t.createdAt,
    sm_updated_at: t.updatedAt,
  }));

  try {
    const supabaseResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/taskflow_inbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });

    if (!supabaseResponse.ok) {
      const errText = await supabaseResponse.text();
      return jsonResponse(
        { pushed: 0, failed: rows.length, errors: [{ taskId: null, error: `Supabase error (${supabaseResponse.status}): ${errText}` }] },
        502,
      );
    }

    return jsonResponse({ pushed: rows.length, failed: 0, errors: [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse(
      { pushed: 0, failed: rows.length, errors: [{ taskId: null, error: message }] },
      502,
    );
  }
}

interface SyncStakeholderPayload {
  stakeholders: { id: string; name: string; categoryIds: string[] }[];
  categories: { id: string; name: string }[];
}

async function handleSyncStakeholders(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return errorResponse('TaskFlow integration not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY Worker secrets.', 500);
  }

  let body: SyncStakeholderPayload;
  try {
    body = await request.json() as SyncStakeholderPayload;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.stakeholders || !Array.isArray(body.stakeholders)) {
    return errorResponse('Missing "stakeholders" array', 400);
  }
  if (!body.categories || !Array.isArray(body.categories)) {
    return errorResponse('Missing "categories" array', 400);
  }

  const supaHeaders = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };

  const errors: string[] = [];

  // 1. Upsert categories into sm_category_mappings (non-fatal if table doesn't exist yet)
  if (body.categories.length > 0) {
    try {
      const categoryRows = body.categories.map((c) => ({
        id: c.id,
        name: c.name,
        updated_at: new Date().toISOString(),
      }));

      const catResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/sm_category_mappings`, {
        method: 'POST',
        headers: { ...supaHeaders, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(categoryRows),
      });

      if (!catResponse.ok) {
        errors.push(`Category sync skipped (${catResponse.status}): table may not exist yet — run migration 009`);
      }
    } catch {
      errors.push('Category sync skipped: network error');
    }
  }

  // 2. Sync stakeholders into projects — fetch existing, then ONE bulk upsert for updates
  //    Uses only 2 subrequests total (fetch + upsert) to stay within Cloudflare limits
  let projectsSynced = 0;
  if (body.stakeholders.length > 0) {
    try {
      // Fetch all existing projects that have sm_stakeholder_id
      const existingResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/projects?sm_stakeholder_id=not.is.null&select=id,sm_stakeholder_id,name`,
        { headers: supaHeaders },
      );
      const existingProjects = existingResp.ok
        ? await existingResp.json() as { id: string; sm_stakeholder_id: string; name: string }[]
        : [];
      const existingBySmId = new Map(existingProjects.map((p) => [p.sm_stakeholder_id, p]));

      // Build rows for bulk upsert via primary key (id)
      const upsertRows = body.stakeholders.map((s) => {
        const existing = existingBySmId.get(s.id);
        // Use existing project ID if found, otherwise generate slug
        const id = existing
          ? existing.id
          : s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        return {
          id,
          name: s.name,
          sm_stakeholder_name: s.name,
          sm_stakeholder_id: s.id,
        };
      });

      const upsertResp = await fetch(`${env.SUPABASE_URL}/rest/v1/projects`, {
        method: 'POST',
        headers: { ...supaHeaders, 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(upsertRows),
      });

      if (upsertResp.ok) {
        const result = await upsertResp.json() as unknown[];
        projectsSynced = result.length;
      } else {
        const errText = await upsertResp.text();
        errors.push(`Project sync failed (${upsertResp.status}): ${errText}`);
      }
    } catch {
      errors.push('Project sync failed: network error');
    }
  }

  return jsonResponse({
    categoriesSynced: body.categories.length,
    projectsSynced,
    errors,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
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

      if (request.method === 'POST' && path === '/taskflow/push') {
        return handleTaskFlowPush(request, env);
      }

      if (request.method === 'POST' && path === '/taskflow/sync-stakeholders') {
        return handleSyncStakeholders(request, env);
      }

      return errorResponse('Not found', 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return errorResponse(message, 500);
    }
  },
};
