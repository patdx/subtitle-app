import {
  generateHydrationScript,
  HydrationScript,
  renderToString,
} from 'solid-js/web';
import { escapeInject, dangerouslySkipEscape } from 'vite-plugin-ssr';
import { PageContext } from './types';
import './styles.css';

export { render };
export { passToClient };

// See https://vite-plugin-ssr.com/data-fetching
const passToClient = ['pageProps', 'documentProps'];

function render(pageContext: PageContext) {
  const { Page, pageProps } = pageContext;

  const pageHtml = renderToString(() => <Page {...pageProps} />);

  // See https://vite-plugin-ssr.com/html-head
  const { documentProps } = pageContext;
  const title = documentProps?.title;
  const description = documentProps?.description;

  return escapeInject`<!DOCTYPE html>${dangerouslySkipEscape(
    renderToString(() => (
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          {title && <title>{title}</title>}
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
