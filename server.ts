import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPokedexAssistantTurn } from './src/server/gemini.ts';
import { analyzePokemonCardLegitimacy } from './src/server/scanner.ts';
import {
  PokeApiError,
  fetchAbilityDetail,
  fetchAllTypesMatrix,
  fetchBerryDetail,
  fetchGenerationDetail,
  fetchItemDetail,
  fetchMoveDetail,
  fetchPokemonDirectory,
  fetchPokemonEncounters,
  fetchPokemonProfile,
  fetchRegionDetail,
  fetchTypeRelations,
} from './src/server/pokeapi.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'pokedex-ai', timestamp: new Date().toISOString() });
  });

  app.get('/api/pokeapi/directory', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const generation = typeof req.query.generation === 'string' ? req.query.generation : undefined;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const result = await fetchPokemonDirectory({ generation, type });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pokeapi/pokemon/:query', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = String(req.params.query || '');
      const profile = await fetchPokemonProfile(query);
      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pokeapi/pokemon/:query/encounters', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = String(req.params.query || '');
      const data = await fetchPokemonEncounters(query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pokeapi/types', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const types = await fetchAllTypesMatrix();
      res.json({ types });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pokeapi/type/:name', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fetchTypeRelations(String(req.params.name || ''));
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pokeapi/move/:name', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fetchMoveDetail(String(req.params.name || ''));
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pokeapi/ability/:name', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fetchAbilityDetail(String(req.params.name || ''));
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pokeapi/item/:name', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fetchItemDetail(String(req.params.name || ''));
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pokeapi/berry/:name', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fetchBerryDetail(String(req.params.name || ''));
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pokeapi/generation/:name', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fetchGenerationDetail(String(req.params.name || ''));
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/pokeapi/region/:name', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fetchRegionDetail(String(req.params.name || ''));
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/scanner/verify', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        frontImageBase64?: unknown;
        frontMimeType?: unknown;
        backImageBase64?: unknown;
        backMimeType?: unknown;
        notes?: unknown;
      };

      const frontImageBase64 =
        typeof body?.frontImageBase64 === 'string' ? body.frontImageBase64 : '';
      const frontMimeType = typeof body?.frontMimeType === 'string' ? body.frontMimeType : '';
      const backImageBase64 =
        typeof body?.backImageBase64 === 'string' && body.backImageBase64
          ? body.backImageBase64
          : undefined;
      const backMimeType =
        typeof body?.backMimeType === 'string' && body.backMimeType ? body.backMimeType : undefined;
      const notes = typeof body?.notes === 'string' ? body.notes : undefined;

      const result = await analyzePokemonCardLegitimacy({
        frontImageBase64,
        frontMimeType,
        backImageBase64,
        backMimeType,
        notes,
      });

      res.json(result);
    } catch (err) {
      const status =
        typeof (err as { status?: number })?.status === 'number'
          ? (err as { status: number }).status
          : 500;
      let rawMessage = err instanceof Error ? err.message : 'Card verification failed.';
      try {
        const parsed = JSON.parse(rawMessage);
        if (parsed?.error?.message) {
          rawMessage = parsed.error.message;
        }
      } catch {
        // plain text error
      }
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: rawMessage });
    }
  });

  app.post('/api/assistant/stream', async (req: Request, res: Response) => {
    const body = req.body as {
      message?: unknown;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      teamSlugs?: unknown;
    };

    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: 'A non-empty message is required.' });
      return;
    }

    const history = Array.isArray(body.history)
      ? body.history.filter(
          (h): h is { role: 'user' | 'assistant'; content: string } =>
            (h?.role === 'user' || h?.role === 'assistant') && typeof h?.content === 'string',
        )
      : [];

    const teamSlugs = Array.isArray(body.teamSlugs)
      ? body.teamSlugs.filter((s): s is string => typeof s === 'string')
      : undefined;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendSse = (payload: unknown) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      await runPokedexAssistantTurn(
        { message, history, teamSlugs },
        (event) => sendSse(event),
      );
    } catch (err) {
      let rawMessage = err instanceof Error ? err.message : 'Assistant request failed.';
      try {
        const parsed = JSON.parse(rawMessage);
        if (parsed?.error?.message) {
          rawMessage = parsed.error.message;
        }
      } catch {
        // plain text error
      }
      sendSse({ type: 'error', error: rawMessage });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.post('/api/assistant/chat', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        message?: unknown;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        teamSlugs?: unknown;
      };

      const message = typeof body?.message === 'string' ? body.message.trim() : '';
      if (!message) {
        res.status(400).json({ error: 'A non-empty message is required.' });
        return;
      }

      const history = Array.isArray(body.history)
        ? body.history.filter(
            (h): h is { role: 'user' | 'assistant'; content: string } =>
              (h?.role === 'user' || h?.role === 'assistant') && typeof h?.content === 'string',
          )
        : [];

      const teamSlugs = Array.isArray(body.teamSlugs)
        ? body.teamSlugs.filter((s): s is string => typeof s === 'string')
        : undefined;

      const result = await runPokedexAssistantTurn({
        message,
        history,
        teamSlugs,
      });

      res.json(result);
    } catch (err) {
      const status =
        typeof (err as { status?: number })?.status === 'number'
          ? (err as { status: number }).status
          : 500;
      let rawMessage = err instanceof Error ? err.message : 'Assistant request failed.';
      try {
        const parsed = JSON.parse(rawMessage);
        if (parsed?.error?.message) {
          rawMessage = parsed.error.message;
        }
      } catch {
        // rawMessage is already plain text
      }
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: rawMessage,
      });
    }
  });

  // Error handler for PokéAPI routes
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof PokeApiError) {
      res.status(err.status).json({
        error: err.message,
        endpoint: err.endpoint,
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`PokéDex AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PokéDex AI server:', err);
  process.exit(1);
});
