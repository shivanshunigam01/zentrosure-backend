const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const env = require('./config/env');
const { isCloudinaryEnabled } = require('./services/cloudinary.service');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error.middleware');

const app = express();
app.set('trust proxy', env.trustProxy);
app.use(helmet({ crossOriginResourcePolicy: false }));
// Reflect any Origin so all cross-origin callers work; required with credentials: true (cannot use '*').
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use('/uploads', express.static(path.resolve(process.cwd(), env.uploadDir)));
if (isCloudinaryEnabled()) {
  console.log('[storage] Inspector media uploads → Cloudinary');
}
app.use(env.apiPrefix, routes);
app.use(notFound);
app.use(errorHandler);
module.exports = app;
