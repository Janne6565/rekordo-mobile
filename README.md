# rekordo-mobile

Expo app for **Rekordo** — the phone surface: library grid, item detail, wishlist,
the scan-first add flow and profile.

The app is **local-first**. The collection lives in a local SQLite database (`expo-sqlite`)
and is fully usable with no account; signing in only starts syncing it to
[`rekordo-backend`](https://github.com/Janne6565/rekordo-backend). See that
repo's `docs/PLAN.md` for the architecture.


## Running against a backend

`bun start` points the app at `http://<your machine>:8080` — a backend running locally.
Without one, nothing works and little says so: sign-in and OAuth fail, and every cover
falls back to its format silhouette because the metadata proxy answered nothing.

| | |
|---|---|
| `bun start` / `bun run dev` | a backend on this machine, port 8080 |
| `bun run start:staging` / `dev:staging` | `staging.rekordo.de` |
| `bun run start:prod` / `dev:prod` | `rekordo.de` |

The `dev:*` variants need a dev-client build; the plain ones run in Expo Go. **OAuth needs
a dev client** — the callback returns to `musiccollector://`, which Expo Go does not own.

`prod` is the real collection. Anything added there is added for real, which is why the
`preview` EAS profile deliberately points at staging instead.


## Stack

Expo SDK 57 · React Native 0.86 · expo-router · TanStack Query · Redux Toolkit ·
lucide-react-native · typed react-i18next · expo-camera (barcode scanning) · expo-sqlite

## Development

```bash
bun install
bun start          # Expo Go — then press i / a, or scan the QR code
bun run dev        # against an installed dev-client build
bun run typecheck
```

Every native module the app uses ships in the Expo Go runtime, so `bun start` is enough
for most work. Real device builds and store releases run through **EAS** — profiles live
in `eas.json`, and the setup (including the GitHub Packages token the EAS worker needs)
is in [`docs/RELEASING.md`](docs/RELEASING.md).

## Gotchas

- **Do not install `@react-navigation/bottom-tabs`.** Expo SDK 57 vendors bottom-tabs
  inside `expo-router`; a second copy is a different React context object, and layout
  values read through it silently come back as zero.
- Design tokens live in `src/theme/colors.ts` and mirror `src/styles.css` in
  `rekordo-frontend`. Change them in both, or the two apps stop reading as one
  product.
- Test files must not live inside `app/` — the typed-routes generator scans that directory
  and misreads a co-located test as a route. Put screen tests in `src/`.

## The shared package

The domain, the merge, the write path and the sync engine live in
[`rekordo-shared`](https://github.com/Janne6565/rekordo-shared) and are
installed from GitHub Packages, which authenticates reads even for a public package. Before
`bun install`:

```
export NODE_AUTH_TOKEN=$(gh auth token)   # needs the read:packages scope
```

CI uses `secrets.GITHUB_TOKEN`; the Docker build takes the same token as a build secret.
