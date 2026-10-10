# HEADROOM IDE — ACCOUNT & SESSION DESIGN

Authoritative Design · Local Profiles, Session Tokens, Re-Authentication & Device Identity

---

## 1. Selected Architecture: Architecture C (Local-First with Future Remote Hook)

HEADROOM is an AI Development Operating System where developers operate locally, often offline or in restricted corporate networks.
- **Primary Mode**: High-security local profile and session management stored in `~/.headroom/profiles.json` and session state in SQLite.
- **Security Primitives**:
  - Profiles are salted and hashed using PBKDF2 with 100,000 iterations (Node.js `crypto`).
  - Session tokens are cryptographically random 256-bit hexadecimal strings with expiration timestamps.
  - Device Fingerprinting: Machine GUID / platform hash binds local sessions to the physical workstation.
- **Provider Credential Decoupling**:
  - Logging out invalidates the active developer session.
  - It does **not** erase the repository files, Git working tree, SQLite workforce database, or configured AI provider API keys.
  - Re-authentication restores full workspace access.

---

## 2. Session Lifecycle

```
[ First Run ] ───► [ Onboarding / Profile Setup ] ───► [ Active Session Created ]
                                                              │
                                     ┌────────────────────────┴───────────────────────┐
                                     ▼                                                ▼
                          [ Inactivity Timeout ]                            [ Explicit Logout ]
                                     │                                                │
                                     ▼                                                ▼
                          [ Session Locked Screen ]                         [ Signed Out State ]
                                     │                                                │
                          [ Enter Password / PIN ]                          [ Sign In / Switch Profile ]
                                     │                                                │
                                     └────────────────────────┬───────────────────────┘
                                                              ▼
                                                   [ Active Session Restored ]
```

---

## 3. Sensitive Action Re-Authentication Gate

The following actions require verified recent authentication (< 5 minutes or explicit re-auth prompt):
1. Viewing masked API keys or adding new AI Provider credentials.
2. Deleting or switching user developer profiles.
3. Clearing workforce execution history or database migrations.
4. Exporting project audit bundles.
