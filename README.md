# patdx-remix-template

## Create a new project from this template

This will copy the code in `main` branch to a new directory.

```
npx degit patdx/patdx-remix-template
```

## Summary

This is a template for React Router 7 (Remix) apps with the following features already set up:

- Cloudflare Pages Functions deployment using wrangler.toml
- React 19
- Auto import plugin with React imports set up
- Tailwind CSS

It is largely based on the [React Router 7 Cloudflare D1 Template](https://github.com/remix-run/react-router-templates/tree/main/cloudflare-d1) but using Cloudflare Pages instead of the new Cloudflare Worker Assets feature, and a different plugin to use Worker Proxy mode instead of the Vite Environments API.

## Adding Node-targeted modules

If you need to use a module that is targeted for Node, try adding `nodejs_compat` to the wrangler.json:

```json
{
  "compatibility_flags": ["nodejs_compat"]
}
```

And add the module to the SSR externals list in vite.config.ts:

```diff
    ssr: {
      external: [
        'node:async_hooks',
+       'nodemailer',
      ],
    },
```

## Development

Run the dev server:

```sh
pnpm dev
```

To run Wrangler:

```sh
pnpm build
pnpm start
```

## Deployment

> [!WARNING]
> Cloudflare does _not_ use `wrangler.toml` to configure deployment bindings.
> You **MUST** [configure deployment bindings manually in the Cloudflare dashboard][bindings].

First, build your app for production:

```sh
pnpm build
```

Then, deploy your app to Cloudflare Pages:

```sh
pnpm run deploy
```

[bindings]: https://developers.cloudflare.com/pages/functions/bindings/

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever css framework you prefer. See the [Vite docs on css](https://vitejs.dev/guide/features.html#css) for more information.
