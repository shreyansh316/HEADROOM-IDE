/**
 * HEADROOM IDE — Account & Session View
 *
 * Renders the Account/Profile menu, Welcome Onboarding modal,
 * Sign-in & Profile switcher dialogs, and Session Inactivity Lock Screen.
 *
 * 100% Pure JavaScript. Zero TypeScript.
 */

export class AccountView {
    constructor({ app }) {
        this.app = app;
        this.currentSession = null;
        this.profiles = [];

        this.init();
    }

    async init() {
        await this.refreshSession();
        this.renderOverlays();
        this.checkInitialState();
    }

    async refreshSession() {
        if (!window.headroomApi || !window.headroomApi.account) return;
        try {
            this.currentSession = await window.headroomApi.account.getSession();
            this.profiles = await window.headroomApi.account.listProfiles();
            this.updateTitleBarAvatar();
        } catch (e) {
            console.warn('[AccountView] Could not refresh session:', e.message);
        }
    }

    updateTitleBarAvatar() {
        const avatarEl = document.getElementById('tb-btn-profile');
        if (!avatarEl) return;

        if (!this.currentSession || !this.currentSession.authenticated) {
            avatarEl.innerHTML = `<span class="avatar-letter" style="background: #999;">?</span>`;
            avatarEl.title = 'Not signed in';
            return;
        }

        const initial = (this.currentSession.name || 'H').charAt(0).toUpperCase();
        avatarEl.innerHTML = `<span class="avatar-letter">${initial}</span>`;
        avatarEl.title = `${this.currentSession.name} (@${this.currentSession.handle}) · ${this.currentSession.role}`;
    }

    renderOverlays() {
        let container = document.getElementById('account-modal-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'account-modal-container';
            container.style.display = 'none';
            document.body.appendChild(container);
        }
    }

    checkInitialState() {
        if (this.currentSession && !this.currentSession.onboardingComplete) {
            this.showOnboardingModal();
        } else if (this.currentSession && this.currentSession.isLocked) {
            this.showLockScreen();
        }
    }

    showAccountMenu(anchorBtn) {
        const rect = anchorBtn.getBoundingClientRect();
        let menuEl = document.getElementById('account-dropdown-menu');
        if (menuEl) {
            menuEl.remove();
            return;
        }

        menuEl = document.createElement('div');
        menuEl.id = 'account-dropdown-menu';
        menuEl.className = 'titlebar-dropdown';
        menuEl.style.position = 'fixed';
        menuEl.style.top = `${rect.bottom + 4}px`;
        menuEl.style.right = `${window.innerWidth - rect.right}px`;
        menuEl.style.width = '260px';
        menuEl.style.zIndex = '9999';

        const profileName = this.currentSession && this.currentSession.name ? this.currentSession.name : 'Guest';
        const profileHandle = this.currentSession && this.currentSession.handle ? `@${this.currentSession.handle}` : '@guest';
        const profileRole = this.currentSession && this.currentSession.role ? this.currentSession.role : 'Local User';

        menuEl.innerHTML = `
            <div style="padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-hover);">
                <div style="font-weight: 700; color: var(--text-primary); font-size: 13px;">${profileName}</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${profileHandle} · ${profileRole}</div>
            </div>
            <div style="padding: 6px 0;">
                <div class="dropdown-item" id="acc-item-onboarding" style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; font-size: 12px;">
                    <span>&#128075;</span> Welcome & Onboarding
                </div>
                <div class="dropdown-item" id="acc-item-switch" style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; font-size: 12px;">
                    <span>&#128101;</span> Switch Profile
                </div>
                <div class="dropdown-item" id="acc-item-audit" style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; font-size: 12px;">
                    <span>&#128220;</span> Security & Session Audit
                </div>
                <div style="height: 1px; background: var(--border-subtle); margin: 4px 0;"></div>
                <div class="dropdown-item" id="acc-item-signout" style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; font-size: 12px; color: #dc2626;">
                    <span>&#128274;</span> Sign Out
                </div>
            </div>
        `;

        document.body.appendChild(menuEl);

        const closeHandler = (e) => {
            if (!menuEl.contains(e.target) && e.target !== anchorBtn) {
                menuEl.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 10);

        menuEl.querySelector('#acc-item-onboarding').onclick = () => {
            menuEl.remove();
            this.showOnboardingModal();
        };

        menuEl.querySelector('#acc-item-switch').onclick = () => {
            menuEl.remove();
            this.showProfileSwitcherModal();
        };

        menuEl.querySelector('#acc-item-audit').onclick = () => {
            menuEl.remove();
            this.showAuditLogsModal();
        };

        menuEl.querySelector('#acc-item-signout').onclick = async () => {
            menuEl.remove();
            await window.headroomApi.account.signOut();
            await this.refreshSession();
            this.showSignInModal();
        };
    }

    showOnboardingModal() {
        const container = document.getElementById('account-modal-container');
        container.style.display = 'flex';
        container.className = 'headroom-modal-backdrop';
        container.innerHTML = `
            <div class="headroom-modal-box" style="max-width: 520px; width: 100%; background: var(--bg-surface); border: 1px solid var(--border-primary); border-radius: 8px; padding: 24px; box-shadow: 0 12px 32px rgba(0,0,0,0.35);">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                    <div style="width: 36px; height: 36px; border-radius: 6px; background: #6479D8; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 18px;">H</div>
                    <div>
                        <h2 style="margin: 0; font-size: 18px; color: var(--text-primary);">Welcome to HEADROOM IDE</h2>
                        <div style="font-size: 12px; color: var(--text-secondary);">Your Standalone AI Development Operating System</div>
                    </div>
                </div>

                <p style="font-size: 13px; line-height: 1.5; color: var(--text-secondary); margin-bottom: 20px;">
                    HEADROOM combines a standalone desktop engineering environment with an authoritative AI workforce.
                    Your code is tested, verified, and executed with strict zero-leak credentials and persistent SQLite state.
                </p>

                <div style="background: var(--bg-hover); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 14px; margin-bottom: 20px;">
                    <div style="font-weight: 600; font-size: 12px; color: var(--text-primary); margin-bottom: 8px;">Active Developer Profile</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">Name: <strong style="color: var(--text-primary);">${this.currentSession ? this.currentSession.name : 'Developer'}</strong></div>
                    <div style="font-size: 12px; color: var(--text-secondary);">Role: <strong style="color: var(--text-primary);">${this.currentSession ? this.currentSession.role : 'Lead Architect'}</strong></div>
                    <div style="font-size: 11px; color: var(--accent-primary); margin-top: 6px;">&#10003; 100% Pure JavaScript Architecture Verified</div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="btn-onboarding-complete" class="btn btn-primary" style="padding: 8px 18px; font-weight: 600; background: #6479D8; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
                        Get Started
                    </button>
                </div>
            </div>
        `;

        container.querySelector('#btn-onboarding-complete').onclick = async () => {
            await window.headroomApi.account.completeOnboarding();
            container.style.display = 'none';
            await this.refreshSession();
        };
    }

    showSignInModal() {
        const container = document.getElementById('account-modal-container');
        container.style.display = 'flex';
        container.className = 'headroom-modal-backdrop';
        container.innerHTML = `
            <div class="headroom-modal-box" style="max-width: 420px; width: 100%; background: var(--bg-surface); border: 1px solid var(--border-primary); border-radius: 8px; padding: 24px; box-shadow: 0 12px 32px rgba(0,0,0,0.35);">
                <h3 style="margin-top: 0; margin-bottom: 6px; color: var(--text-primary); font-size: 16px;">Sign In to HEADROOM</h3>
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 18px;">Unlock your workspace developer profile</div>

                <div id="signin-error-box" style="display: none; padding: 8px 12px; background: rgba(220,38,38,0.1); border: 1px solid rgba(220,38,38,0.3); color: #dc2626; border-radius: 4px; font-size: 12px; margin-bottom: 14px;"></div>

                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">PROFILE / HANDLE</label>
                        <select id="signin-profile-select" style="width: 100%; padding: 8px; background: var(--bg-input); border: 1px solid var(--border-primary); border-radius: 4px; color: var(--text-primary); font-size: 12px;">
                            ${this.profiles.map(p => `<option value="${p.id}">${p.name} (@${p.handle})</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">PASSWORD / PIN</label>
                        <input type="password" id="signin-password-input" placeholder="Enter password (default: headroom)" style="width: 100%; padding: 8px; background: var(--bg-input); border: 1px solid var(--border-primary); border-radius: 4px; color: var(--text-primary); font-size: 12px; box-sizing: border-box;" />
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="btn-signin-submit" class="btn btn-primary" style="padding: 8px 18px; font-weight: 600; background: #6479D8; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
                        Sign In
                    </button>
                </div>
            </div>
        `;

        const errorBox = container.querySelector('#signin-error-box');
        const passInput = container.querySelector('#signin-password-input');
        const profileSelect = container.querySelector('#signin-profile-select');

        const doSignIn = async () => {
            const profileId = profileSelect.value;
            const password = passInput.value;
            const result = await window.headroomApi.account.signIn(profileId, password);
            if (result.ok) {
                container.style.display = 'none';
                await this.refreshSession();
            } else {
                errorBox.style.display = 'block';
                errorBox.textContent = result.error || 'Authentication failed.';
            }
        };

        container.querySelector('#btn-signin-submit').onclick = doSignIn;
        passInput.onkeydown = (e) => { if (e.key === 'Enter') doSignIn(); };
    }

    showLockScreen() {
        const container = document.getElementById('account-modal-container');
        container.style.display = 'flex';
        container.className = 'headroom-modal-backdrop';
        container.innerHTML = `
            <div class="headroom-modal-box" style="max-width: 380px; width: 100%; background: var(--bg-surface); border: 1px solid var(--border-primary); border-radius: 8px; padding: 24px; text-align: center; box-shadow: 0 12px 32px rgba(0,0,0,0.35);">
                <div style="font-size: 32px; margin-bottom: 12px;">&#128274;</div>
                <h3 style="margin-top: 0; margin-bottom: 6px; color: var(--text-primary); font-size: 16px;">Workspace Locked</h3>
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 16px;">Locked due to inactivity. Enter your password to resume.</div>

                <div id="unlock-error-box" style="display: none; padding: 8px 12px; background: rgba(220,38,38,0.1); border: 1px solid rgba(220,38,38,0.3); color: #dc2626; border-radius: 4px; font-size: 12px; margin-bottom: 14px;"></div>

                <input type="password" id="unlock-password-input" placeholder="Password (default: headroom)" style="width: 100%; padding: 8px; background: var(--bg-input); border: 1px solid var(--border-primary); border-radius: 4px; color: var(--text-primary); font-size: 12px; box-sizing: border-box; margin-bottom: 16px;" autofocus />

                <div style="display: flex; justify-content: center; gap: 10px;">
                    <button id="btn-unlock-submit" class="btn btn-primary" style="padding: 8px 24px; font-weight: 600; background: #6479D8; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
                        Unlock Workspace
                    </button>
                </div>
            </div>
        `;

        const errorBox = container.querySelector('#unlock-error-box');
        const passInput = container.querySelector('#unlock-password-input');

        const doUnlock = async () => {
            const result = await window.headroomApi.account.unlock(passInput.value);
            if (result.ok) {
                container.style.display = 'none';
                await this.refreshSession();
            } else {
                errorBox.style.display = 'block';
                errorBox.textContent = result.error || 'Incorrect password.';
            }
        };

        container.querySelector('#btn-unlock-submit').onclick = doUnlock;
        passInput.onkeydown = (e) => { if (e.key === 'Enter') doUnlock(); };
    }

    showProfileSwitcherModal() {
        this.showSignInModal();
    }

    async showAuditLogsModal() {
        const logs = await window.headroomApi.account.getAuditLogs(30);
        const container = document.getElementById('account-modal-container');
        container.style.display = 'flex';
        container.className = 'headroom-modal-backdrop';
        container.innerHTML = `
            <div class="headroom-modal-box" style="max-width: 650px; width: 100%; max-height: 80vh; display: flex; flex-direction: column; background: var(--bg-surface); border: 1px solid var(--border-primary); border-radius: 8px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.35);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                    <h3 style="margin: 0; color: var(--text-primary); font-size: 15px;">Session & Security Audit Ledger</h3>
                    <button id="btn-close-audit" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px;">&times;</button>
                </div>

                <div style="flex: 1; overflow-y: auto; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 10px; font-family: var(--font-mono); font-size: 11px;">
                    ${logs.length === 0 ? '<div style="color: var(--text-muted);">No audit entries recorded.</div>' : logs.map(l => `
                        <div style="padding: 6px 0; border-bottom: 1px solid var(--border-subtle);">
                            <span style="color: var(--text-muted);">${new Date(l.timestamp).toLocaleTimeString()}</span> ·
                            <strong style="color: #6479D8;">${l.action}</strong> ·
                            <span style="color: var(--text-secondary);">${l.profileId || 'Anonymous'}</span> ·
                            <span style="color: var(--text-muted);">Device: ${l.deviceFingerprint}</span>
                        </div>
                    `).join('')}
                </div>

                <div style="display: flex; justify-content: flex-end; margin-top: 14px;">
                    <button id="btn-audit-done" class="btn" style="padding: 6px 16px; background: var(--bg-hover); border: 1px solid var(--border-primary); color: var(--text-primary); border-radius: 4px; cursor: pointer;">
                        Close
                    </button>
                </div>
            </div>
        `;

        const close = () => { container.style.display = 'none'; };
        container.querySelector('#btn-close-audit').onclick = close;
        container.querySelector('#btn-audit-done').onclick = close;
    }
}
