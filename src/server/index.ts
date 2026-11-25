import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { createDevvitDeps, sourceMode } from './core/devvit-deps';
import { createPostUrl } from './core/post';
import { createApi } from './routes/api';
import { forms } from './routes/forms';
import { createMenu } from './routes/menu';
import { createScheduler } from './routes/scheduler';
import { triggers } from './routes/triggers';

// Real Reddit content unless RABBITHOLE_SOURCE=mock.
const deps = createDevvitDeps(sourceMode(process.env.RABBITHOLE_SOURCE));

const app = new Hono();
const internal = new Hono();

internal.route('/menu', createMenu(deps, { createPost: createPostUrl }));
internal.route('/form', forms);
internal.route('/triggers', triggers);
internal.route('/scheduler', createScheduler(deps));

app.route('/api', createApi(deps));
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
