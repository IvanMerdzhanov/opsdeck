import { createDemoServer } from './demo.js';

const server = createDemoServer();
const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => console.log(`demo-target listening on ${port}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
