import { describe, it, expect, afterEach } from 'vitest';
import TerminalService from '../src/main/services/TerminalService.js';

describe('TerminalService', () => {
    let service = new TerminalService();

    afterEach(() => {
        service.closeAll();
    });

    it('creates a controlled terminal session with process handle', async () => {
        const receivedData = [];
        const session = service.createSession(
            process.cwd(),
            (id, data) => receivedData.push(data),
            () => {}
        );

        expect(session.id).toBeDefined();
        expect(session.shell).toBeDefined();

        // Give process a moment to initialize
        const start = Date.now();
        while (receivedData.length === 0 && Date.now() - start < 2000) {
            await new Promise(r => setTimeout(r, 100));
        }
        expect(receivedData.length).toBeGreaterThan(0);

        const killed = service.killSession(session.id);
        expect(killed).toBe(true);
    });

    it('cleans up all sessions on closeAll', () => {
        const s1 = service.createSession(process.cwd());
        const s2 = service.createSession(process.cwd());
        expect(service.sessions.size).toBe(2);

        service.closeAll();
        expect(service.sessions.size).toBe(0);
    });
});
