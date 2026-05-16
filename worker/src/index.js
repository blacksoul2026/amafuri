/**
 * アマフリ管理 - Cloudflare Worker
 * データ同期API (KV ストレージ使用)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default {
  async fetch(req, env) {
    // プリフライト
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // 認証 (API_TOKEN 環境変数と照合)
    const auth = req.headers.get('Authorization') || '';
    if (!env.API_TOKEN || auth !== 'Bearer ' + env.API_TOKEN) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { pathname } = new URL(req.url);

    // GET /api/sync → クラウドからデータ取得
    if (pathname === '/api/sync' && req.method === 'GET') {
      const data = await env.DATA.get('amafuri', 'text');
      return new Response(data || 'null', {
        headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // PUT /api/sync → クラウドへデータ保存
    if (pathname === '/api/sync' && req.method === 'PUT') {
      const body = await req.text();
      if (body.length > 20 * 1024 * 1024) {
        return json({ error: 'データが大きすぎます (20MB超)' }, 413);
      }
      await env.DATA.put('amafuri', body);
      return json({ ok: true, savedAt: new Date().toISOString() });
    }

    return json({ error: 'Not found' }, 404);
  },
};
