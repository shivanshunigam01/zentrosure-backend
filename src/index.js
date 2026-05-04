const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');

connectDB().then(() => {
  app.listen(env.port, () => console.log(`ZentroSure API running on port ${env.port}${env.apiPrefix}`));
}).catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
