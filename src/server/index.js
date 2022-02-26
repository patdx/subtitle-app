import { createServer } from 'http';
import { createApp, assertMethod } from 'h3';
import { createPageRenderer } from 'vite-plugin-ssr';
import { dirname } from 'dirname-filename-esm';
import serveStatic from 'serve-static';

const __dirname = dirname(import.meta);

const isProduction = process.env.NODE_ENV === 'production';
const root = `${__dirname}/../..`;

startServer();

async function startServer() {
  const app = createApp();

  let viteDevServer;
  if (isProduction) {
    app.use(serveStatic(`${root}/dist/client`));
  } else {
    const { createServer } = await import('vite');
    viteDevServer = await createServer({
      root,
      server: { middlewareMode: true },
    });
    app.use(viteDevServer.middlewares);
  }

  const renderPage = createPageRenderer({ viteDevServer, isProduction, root });
  app.use(async (req, res, next) => {
    assertMethod(req, 'GET', true);
    const url = req.originalUrl;
    const pageContextInit = {
      url,
    };
    const pageContext = await renderPage(pageContextInit);
    const { httpResponse } = pageContext;
    if (!httpResponse) return next();
    const { statusCode, body } = httpResponse;
    res.statusCode = statusCode;
    res.end(body);
  });

  const port = process.env.PORT || 3000;
  createServer(app).listen(port);
  console.log(`Server running at http://localhost:${port}`);
}
