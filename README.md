# ZentroSure Backend API

Fully fledged Node.js + Express + MongoDB backend for the autosure-hub / ZentroSure vehicle inspection platform.

## Features included

- JWT auth with customer/admin/inspector roles
- Customer booking APIs
- Admin booking assignment, checklist, verify, send-back, publish-report flow
- Inspector task list, booking detail, photo upload, final inspection submission
- Public service catalog, blogs, FAQs, cities, leads, report verification
- OTP session model and AiSensy-ready service
- Razorpay-ready payment order service
- Mongoose models, controllers, routes, middleware, error format, validation, rate limits
- Seeder for admin, inspector, services, content

## Setup

```bash
npm install
cp .env.example .env
# update MONGO_URI and JWT_SECRET
npm run seed
npm run dev
```

API starts at:

```txt
http://localhost:5000/v1
```

Health check:

```txt
GET /v1/health
```

## Demo logins after seed

```txt
Admin: admin@zentrosure.com / Password@123
Inspector: inspector@zentrosure.com / Password@123
```

## Main endpoint map

### Public

- `GET /v1/services`
- `GET /v1/services/:slug`
- `GET /v1/cities`
- `GET /v1/blog`
- `GET /v1/blog/:slug`
- `GET /v1/faqs`
- `POST /v1/leads/contact`
- `POST /v1/leads/quick-callback`
- `GET /v1/reports/verify/:reportId`

### Auth / OTP

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `POST /v1/auth/otp/send`
- `POST /v1/auth/otp/verify`

### Customer

- `GET /v1/me`
- `PATCH /v1/me`
- `POST /v1/bookings`
- `GET /v1/bookings`
- `GET /v1/bookings/:bookingNumber`
- `GET /v1/reports`
- `POST /v1/payments/orders`

### Inspector

- `GET /v1/inspector/tasks`
- `GET /v1/inspector/bookings/:bookingNumber`
- `POST /v1/inspector/bookings/:bookingNumber/photos`
- `POST /v1/inspector/bookings/:bookingNumber/submit`

### Admin

- `GET /v1/admin/bookings`
- `GET /v1/admin/bookings/:bookingNumber`
- `PATCH /v1/admin/bookings/:bookingNumber/checklist`
- `POST /v1/admin/bookings/:bookingNumber/assign`
- `POST /v1/admin/bookings/:bookingNumber/send-back`
- `POST /v1/admin/bookings/:bookingNumber/verify`
- `POST /v1/admin/bookings/:bookingNumber/publish-report`
- `GET /v1/admin/inspectors`
- `GET /v1/admin/services`
- `POST /v1/admin/services`
- `PATCH /v1/admin/services/:id`
- `DELETE /v1/admin/services/:id`

## Frontend env

```txt
VITE_API_URL=http://localhost:5000/v1
```

## Notes

- In development, OTP is printed in the server console when AiSensy keys are not configured.
- For production, set real AiSensy and Razorpay credentials in `.env`.
- Uploaded inspection photos are stored in `/uploads` locally. Move `storage.service.js` to S3/MinIO for production scale.
