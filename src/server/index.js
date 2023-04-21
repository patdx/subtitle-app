import { createServer } from 'http';
import { createApp, assertMethod, eventHandler } from 'h3';
import { renderPage } from 'vite-plugin-ssr/server';
import { dirname } from 'dirname-filename-esm';
import serveStatic from 'serve-static';
import { createRouter } from 'h3';
import { send } from 'h3';
import { setResponseStatus } from 'h3';
import { fromNodeMiddleware } from 'h3';
import { toNodeListener } from 'h3';
import { getRequestURL } from 'h3';

const __dirname = dirname(import.meta);

const isProduction = process.env.NODE_ENV === 'production';
const root = `${__dirname}/../..`;

startServer();

async function startServer() {
  const app = createApp();

  let viteDevServer;
  if (isProduction) {
    app.use(fromNodeMiddleware(serveStatic(`${root}/dist/client`)));
  } else {
    const { createServer } = await import('vite');
    viteDevServer = await createServer({
      root,
      server: { middlewareMode: true },
    });
    app.use(fromNodeMiddleware(viteDevServer.middlewares));
  }

  app.use(
    eventHandler(async (event) => {
      assertMethod(event, 'GET');
      const urlOriginal = getRequestURL(event).toString();
      const pageContextInit = {
        urlOriginal,
      };
      const pageContext = await renderPage(pageContextInit);
      const { httpResponse } = pageContext;
      if (!httpResponse) return next();
      const { statusCode, body } = httpResponse;
      setResponseStatus(event, statusCode);
      await send(event, body);
    })
  );

  const port = process.env.PORT || 3000;
  createServer(toNodeListener(app)).listen(port);
  console.log(`Server running at http://localhost:${port}`);
}
