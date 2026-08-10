# DevAuth Integration

Imageryx is a confidential OAuth 2.1 / OIDC client of the standalone
DevAuth provider. DevAuth owns authentication; Imageryx owns its own
application session.

## Values

| Setting             | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| Local issuer        | `http://localhost:8786`                               |
| Production issuer   | `https://auth-devflare.andersseen.dev`                |
| Client ID           | `imageryx`                                            |
| Local callback      | `http://localhost:5173/proxy/auth/callback`           |
| Production callback | `https://imageryx.andersseen.dev/proxy/auth/callback` |
| Scope               | `openid profile email`                                |
| Login route         | `/proxy/auth/login`                                   |
| Callback route      | `/proxy/auth/callback`                                |
| Logout route        | `/proxy/auth/logout`                                  |
| Session endpoint    | `/proxy/auth/session`                                 |

The `/proxy` prefix is intentional: Analog forwards that prefix to Nitro in
development. If the dashboard deployment moves to a Workers/Pages SSR
configuration that serves `/auth/*` directly, update both Imageryx
`DEV_AUTH_REDIRECT_URI` and DevAuth `redirectURIs` byte for byte.

## DevFlare Configuration

Add Imageryx to `apps/dev-auth/wrangler.toml` in the DevFlare repository:

```toml
OAUTH_CLIENTS = '''[
  {
    "clientId": "devflare",
    "name": "DevFlare",
    "type": "web",
    "redirectURIs": ["https://devflare.andersseen.dev/api/auth/callback"]
  },
  {
    "clientId": "imageryx",
    "name": "Imageryx",
    "type": "web",
    "redirectURIs": [
      "http://localhost:5173/proxy/auth/callback",
      "https://imageryx.andersseen.dev/proxy/auth/callback"
    ]
  }
]'''
```

Then update DevAuth's secret map without committing the secret:

```bash
openssl rand -base64 32
pnpm --filter @devflare/dev-auth exec wrangler secret put OAUTH_CLIENT_SECRETS --env production
```

The secret value should be a JSON object containing every confidential
client, for example:

```json
{
  "devflare": "<existing-devflare-secret>",
  "imageryx": "<new-imageryx-client-secret>"
}
```

## Imageryx Configuration

Set these server-side dashboard variables locally and in production:

```bash
DEV_AUTH_URL=http://localhost:8786
DEV_AUTH_CLIENT_ID=imageryx
DEV_AUTH_CLIENT_SECRET=<same-secret-as-dev-auth-map>
DEV_AUTH_REDIRECT_URI=http://localhost:5173/proxy/auth/callback
DEV_AUTH_SCOPE="openid profile email"
SESSION_SECRET=<independent-random-session-secret>
IMAGERYX_INTERNAL_API_KEY=<dashboard-proxy-api-key>
```

For production, switch `DEV_AUTH_URL` and `DEV_AUTH_REDIRECT_URI` to the
production issuer/callback values above.

Do not use `VITE_` prefixes for secrets. Browser code reads session state
from `/proxy/auth/session`; it never sees the DevAuth client secret,
provider tokens, the session-signing secret, or the internal API key.

## Flow

1. `/proxy/auth/login` creates `state`, `nonce`, a PKCE verifier and an
   S256 challenge, stores the transaction in an HttpOnly cookie and sends
   the browser to DevAuth discovery's authorization endpoint.
2. `/proxy/auth/callback` validates `state`, checks the callback `iss`
   when present, exchanges the code server side with the PKCE verifier and
   client secret, reads identity from `userinfo`, creates an Imageryx
   session cookie keyed on DevAuth `sub`, and discards provider tokens.
3. `/proxy/auth/logout` clears only the Imageryx session. It does not end
   the global DevAuth session.

## Troubleshooting

- Clicking "Continue with DevAuth" renders "Sign-in is not configured":
  Imageryx is still missing one of `DEV_AUTH_*` / `SESSION_SECRET`, or a value
  still contains a placeholder such as `replace-with...` or
  `placeholder-not-yet-registered`.
- `invalid_client`: DevAuth does not have `imageryx` in `OAUTH_CLIENTS`, the
  secret map is missing `imageryx`, or the secret values differ.
- Redirect never reaches Imageryx: the callback URI differs by path,
  scheme, host, query string, fragment, or trailing slash.
- Dashboard API calls return `auth_not_configured`: dashboard server
  environment is missing `DEV_AUTH_*` or `SESSION_SECRET`.
- Dashboard API calls return `unauthenticated_dashboard_session`: the local
  Imageryx session is missing or expired; start `/proxy/auth/login` again.

## Secret Rotation

Generate a new client secret, update DevAuth `OAUTH_CLIENT_SECRETS` and
Imageryx `DEV_AUTH_CLIENT_SECRET`, deploy/restart both sides, then remove
the old value from the DevAuth secret map. Rotate `SESSION_SECRET`
separately; doing so invalidates existing Imageryx sessions.
