import { HydrationScript, renderToString } from 'solid-js/web';
import { dangerouslySkipEscape, escapeInject } from 'vite-plugin-ssr';
import './styles.css';
import { PageContext } from './types';

export { render };
export { passToClient };

// See https://vite-plugin-ssr.com/data-fetching
const passToClient = ['pageProps', 'documentProps'];

function render(pageContext: PageContext) {
  const { Page, pageProps } = pageContext;

  const pageHtml = renderToString(() => <Page {...pageProps} />);

  // See https://vite-plugin-ssr.com/html-head
  const { documentProps } = pageContext;
  const title = documentProps?.title ?? 'Subtitle App';
  const description = documentProps?.description;

  return escapeInject`<!DOCTYPE html>${dangerouslySkipEscape(
    renderToString(() => (
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0, viewport-fit=cover"
          />
          <link
            rel="manifest"
            href="/webmanifest.json"
            crossOrigin="use-credentials"
          />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="black-translucent"
          />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/favicon-32x32.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="/favicon-16x16.png"
          />
          {<title>{title}</title>}
          {description && <meta name="description" content={description} />}
          <HydrationScript />
        </head>
        <body>
          <div id="page-view" innerHTML={pageHtml} />
        </body>
      </html>
    ))
  )}`;
}
