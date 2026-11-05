# Reverse-proxy deployment contract

Mediavault serves HTTP. The operator owns Caddy, HTTPS certificates, DNS, public ingress, and perimeter traffic controls; the app does not install or configure them.

## Public origin

When Caddy terminates HTTPS and forwards HTTP to the app, set the browser-facing origin:

```dotenv
MEDIAVAULT_PUBLIC_ORIGIN=https://vault.example.com
```

Use only scheme, host, and optional port, without a path, credentials, query, or fragment. The app uses this fixed origin for cookie-command CSRF checks instead of the internal HTTP request origin. Authentication redirects remain relative, so they do not send the browser to the internal HTTP address.

Leave the setting unset for direct local access, where the request origin is used. Incoming forwarding headers never override the configured CSRF origin. Express proxy trust remains disabled.

## Optional forwarded client IP

```dotenv
MEDIAVAULT_AUTH_TRUST_PROXY_HEADERS=false
```

Keep the default unless the app port is private and every request comes through Caddy configured to overwrite untrusted `X-Forwarded-For`. When enabled, the app reads only that header for the failed-login source bucket. It does not interpret `CF-Connecting-IP`, `X-Real-IP`, or `Forwarded` as alternative identities.

Caddy's default reverse proxy replaces untrusted incoming forwarding headers. Extra upstream proxies/CDNs require operator configuration; do not expose the backend port directly while trusting forwarded client addresses.

The checked-in Compose file publishes the app port. For a same-host Caddy deployment, restrict that publication to loopback (for example, `127.0.0.1:3000:3000`) in an operator-owned override or enforce equivalent firewall isolation. A private container network can instead expose the backend only to the proxy. Configure this boundary before enabling forwarded-IP trust; the application does not maintain a registry of trusted proxy deployments.

Failed-login counts always include the normalized account and may also include a signed client cookie or explicitly trusted IP. Unknown clients do not share one global login lock. Existing failure thresholds and windows are unchanged.

The app owns authorization, session-bound playback, and CSRF enforcement. Network request/bandwidth budgets remain an operator perimeter concern; there is no application WAF or per-client quota registry. Playback grants are not bound to a client's IP address. Any perimeter request-size policy should distinguish small JSON commands from streaming media uploads.

See [Caddy reverse-proxy defaults](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults) and [Express proxy-trust cautions](https://expressjs.com/en/guide/behind-proxies.html).
