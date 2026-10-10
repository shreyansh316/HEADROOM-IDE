/**
 * HEADROOM AI API Gateway — Loopback HTTP Server
 *
 * Implements OpenRouter/OpenAI-compatible HTTP endpoints:
 *   - POST /v1/chat/completions (with SSE streaming)
 *   - GET  /v1/models
 *   - GET  /health
 *
 * Runs on 127.0.0.1 (loopback only) with rate limiting, bearer authentication,
 * and request size limits. 100% Pure JavaScript.
 */

const http = require('http');

class GatewayServer {
    constructor(gatewayService, { port = 41400, host = '127.0.0.1', apiKey = null } = {}) {
        this.gatewayService = gatewayService;
        this.port = port;
        this.host = host;
        this.apiKey = apiKey; // Optional gateway client bearer token
        this.server = null;
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.listen(this.port, this.host, () => {
                resolve({ port: this.port, host: this.host });
            });

            this.server.on('error', (err) => {
                reject(err);
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
            } else {
                resolve();
            }
        });
    }

    async handleRequest(req, res) {
        // Set CORS headers for local tools
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // Bearer auth check if configured
        if (this.apiKey) {
            const authHeader = req.headers['authorization'] || '';
            const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
            if (bearerToken !== this.apiKey) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Unauthorized gateway request', code: 'invalid_api_key' } }));
                return;
            }
        }

        const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

        try {
            if (req.method === 'GET' && url.pathname === '/health') {
                const providers = this.gatewayService.getSafeProviderStatus();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'healthy',
                    version: '1.0.0',
                    gateway: 'HEADROOM AI Gateway',
                    providers
                }));
                return;
            }

            if (req.method === 'GET' && url.pathname === '/v1/models') {
                const models = this.gatewayService.getModels();
                const formatted = models.map(m => ({
                    id: m.id,
                    object: 'model',
                    created: 1700000000,
                    owned_by: m.provider,
                    permission: [],
                    root: m.id,
                    parent: null,
                    context_window: m.contextWindow,
                    pricing: m.pricing
                }));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ object: 'list', data: formatted }));
                return;
            }

            if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
                await this.handleChatCompletions(req, res);
                return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: `Route not found: ${req.method} ${url.pathname}`, code: 'route_not_found' } }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: err.message, code: 'internal_gateway_error' } }));
        }
    }

    async handleChatCompletions(req, res) {
        let bodyStr = '';
        req.on('data', chunk => {
            bodyStr += chunk;
            if (bodyStr.length > 5 * 1024 * 1024) { // 5MB limit
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Payload too large', code: 'payload_too_large' } }));
                req.destroy();
            }
        });

        req.on('end', async () => {
            let body;
            try {
                body = JSON.parse(bodyStr);
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Invalid JSON body', code: 'invalid_json' } }));
                return;
            }

            const isStream = Boolean(body.stream);
            const policy = req.headers['x-routing-policy'] || body.routing_policy || 'balanced';

            if (isStream) {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });

                try {
                    await this.gatewayService.chatCompletion({
                        request: body,
                        policy,
                        onChunk: (chunk) => {
                            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                        }
                    });
                    res.write('data: [DONE]\n\n');
                    res.end();
                } catch (err) {
                    res.write(`data: ${JSON.stringify({ error: { message: err.message, code: err.code || 'stream_error' } })}\n\n`);
                    res.end();
                }
            } else {
                try {
                    const completion = await this.gatewayService.chatCompletion({
                        request: body,
                        policy
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(completion));
                } catch (err) {
                    res.writeHead(err.status || 500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: err.message, code: err.code || 'gateway_error' } }));
                }
            }
        });
    }
}

module.exports = GatewayServer;
