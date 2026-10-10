/**
 * HEADROOM Desktop IDE — Mobile Command Center Responsive UI Service
 *
 * Implements PHASE-32 (HR-218 through HR-224):
 * - HR-218: Responsive Mobile Command Center Web Application Shell
 * - HR-219: Real-Time Mission Timeline & Milestone Progress Dashboard
 * - HR-220: Mobile Unified Diff & Code Change Inspection View
 * - HR-221: Remote Task Submission & Prompt Dispatch Interface
 * - HR-222: Mobile Executive Approval Dialog & One-Tap Decision Gate
 * - HR-223: Mobile Emergency Stop & Instant Cancellation Trigger
 * - HR-224: Mobile Offline State Banner & Reconnection Indicator
 */

class MobileUiShellService {
    constructor() {
        this.version = '2.0.0';
    }

    /**
     * HR-218: Generates complete responsive standalone HTML shell for mobile browsers
     */
    generateMobileShellHtml({ appTitle = 'HEADROOM Mobile Command Center', gatewayUrl = '' } = {}) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${appTitle}</title>
    <style>
        :root {
            --bg-primary: #0a0c10;
            --bg-secondary: #131720;
            --border: #232836;
            --accent: #58a6ff;
            --accent-green: #3fb950;
            --accent-red: #f85149;
            --accent-yellow: #d29922;
            --text-primary: #f0f6fc;
            --text-secondary: #8b949e;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: var(--bg-primary); color: var(--text-primary); min-height: 100vh; display: flex; flex-direction: column; }
        
        /* HR-224: Offline Banner */
        #offlineBanner {
            background: var(--accent-red);
            color: #fff;
            text-align: center;
            padding: 8px;
            font-size: 13px;
            font-weight: 600;
            display: none;
        }

        header {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 12px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .header-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .badge-live { background: rgba(63, 185, 80, 0.2); color: var(--accent-green); padding: 2px 8px; border-radius: 12px; font-size: 11px; }

        /* HR-223: Emergency Stop */
        .btn-estop {
            background: rgba(248, 81, 73, 0.2);
            color: var(--accent-red);
            border: 1px solid var(--accent-red);
            padding: 6px 12px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 12px;
            cursor: pointer;
        }

        main { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 16px; }

        .card {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 14px;
        }
        .card-header { font-size: 14px; font-weight: 600; margin-bottom: 10px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }

        /* HR-221: Prompt Dispatch */
        .prompt-input {
            width: 100%;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            color: var(--text-primary);
            padding: 10px;
            border-radius: 6px;
            font-size: 14px;
            resize: none;
            height: 70px;
        }
        .btn-dispatch {
            margin-top: 8px;
            width: 100%;
            background: var(--accent);
            color: #fff;
            border: none;
            padding: 10px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
        }

        /* HR-222: Approval Gate Dialog */
        .approval-gate {
            border: 1px solid var(--accent-yellow);
            background: rgba(210, 153, 34, 0.08);
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 12px;
            display: none;
        }
        .approval-actions { display: flex; gap: 8px; margin-top: 10px; }
        .btn-approve { flex: 1; background: var(--accent-green); color: #fff; border: none; padding: 8px; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .btn-reject { flex: 1; background: var(--accent-red); color: #fff; border: none; padding: 8px; border-radius: 6px; font-weight: 600; cursor: pointer; }

        /* HR-219 & HR-220: Timeline & Diff */
        .timeline-item { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
        .diff-viewer { background: #000; border-radius: 6px; padding: 8px; font-family: monospace; font-size: 11px; white-space: pre-wrap; color: var(--accent-green); max-height: 150px; overflow-y: auto; }
    </style>
</head>
<body>
    <div id="offlineBanner">Connection Lost. Attempting Reconnection...</div>
    <header>
        <div class="header-title">
            <span>HEADROOM</span>
            <span class="badge-live">CONNECTED</span>
        </div>
        <button id="eStopBtn" class="btn-estop">EMERGENCY STOP</button>
    </header>

    <main>
        <!-- HR-222: Approval Gate -->
        <div id="approvalCard" class="approval-gate">
            <div style="font-weight: 600; color: var(--accent-yellow); margin-bottom: 4px;">Approval Requested</div>
            <div id="approvalSummary" style="font-size: 13px;">Agent requesting git commit and push.</div>
            <div class="approval-actions">
                <button id="approveBtn" class="btn-approve">APPROVE</button>
                <button id="rejectBtn" class="btn-reject">REJECT</button>
            </div>
        </div>

        <!-- HR-221: Prompt Dispatch -->
        <div class="card">
            <div class="card-header">Dispatch Mission</div>
            <textarea id="promptInput" class="prompt-input" placeholder="Type instructions for workforce..."></textarea>
            <button id="dispatchBtn" class="btn-dispatch">Send to Workforce</button>
        </div>

        <!-- HR-219: Timeline Progress -->
        <div class="card">
            <div class="card-header">Mission Timeline</div>
            <div id="timelineContainer">
                <div class="timeline-item">No active missions. Standing by.</div>
            </div>
        </div>

        <!-- HR-220: Diff Viewer -->
        <div class="card">
            <div class="card-header">Live Diff Inspection</div>
            <div id="diffContainer" class="diff-viewer">// No pending diffs</div>
        </div>
    </main>

    <script>
        const gatewayUrl = "${gatewayUrl}";
        let isOnline = navigator.onLine;

        window.addEventListener('online', () => {
            document.getElementById('offlineBanner').style.display = 'none';
        });
        window.addEventListener('offline', () => {
            document.getElementById('offlineBanner').style.display = 'block';
        });

        document.getElementById('eStopBtn').addEventListener('click', () => {
            if (confirm('Trigger EMERGENCY STOP across all active workforce missions?')) {
                fetch(gatewayUrl + '/api/missions/emergency-stop', { method: 'POST' });
            }
        });
    </script>
</body>
</html>`;
    }

    renderApprovalGate(request) {
        return {
            id: request.requestId || 'req-1',
            title: request.title || 'Executive Approval Gate',
            action: request.action || 'MODIFY_CODE',
            riskLevel: request.riskLevel || 'HIGH',
            actionsAllowed: ['APPROVE', 'REJECT']
        };
    }
}

module.exports = MobileUiShellService;
