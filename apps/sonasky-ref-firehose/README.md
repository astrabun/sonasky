# SonaSky REF Firehose

> A simple web page to view live record creation/updates to Sonasky Ref Sheets

Subscribes to the Bluesky AT Protocol firehose via [Jetstream](https://github.com/mary-ext/atcute/tree/trunk/packages/clients/jetstream), filtered to `app.sonasky.ref` events, and displays them in real time with profile info, sona images, and NSFW blur.

Deployed as a Cloudflare Worker holding the `ref.sonasky.app/firehose` route in front of the [sonasky-ref](../sonasky-ref) Pages project, so it ships independently of it.

## Development

```sh
pnpm sonasky-ref-firehose:dev          # Vite dev server
pnpm sonasky-ref-firehose:dev:worker   # wrangler dev, serving the built assets
```

## Build & deploy

```sh
pnpm -F @sonasky/app-sonasky-ref-firehose build
pnpm sonasky-ref-firehose:deploy
```
