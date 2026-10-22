# Punjab Tadka

Punjab Tadka is a legacy CommonJS/Express and Mongoose application. `pdt.js`
serves the restaurant API; `server.js` serves the separate GridFS branding API.
They are separate processes and must listen on different ports if run together.

## Requirements and configuration

- Node.js and MongoDB
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `SESSION_SECRET`: independent,
  randomly generated values of at least 32 characters
- `MONGODB_URL` and `SHARED_MONGODB_URL` for production; development defaults
  to a local MongoDB instance

Generate a secret with Node.js (run three times to obtain independent values):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set the variables in the shell/environment that will start the server. Do not
commit secrets or provider credentials to source control. For production,
configure `MONGODB_URL` and `SHARED_MONGODB_URL` to the intended MongoDB
databases, as well as the three secrets above.

Optional integrations:

- Email requires `SMTP_USER` and `SMTP_PASSWORD`.
- OTP SMS requires `SMS_GATEWAY_URL` (HTTPS), `SMS_GATEWAY_USER`, and
  `SMS_GATEWAY_PASSWORD`. The provider's accepted query parameter names must
  match the integration in `pdt.js`; verify these with the provider before
  enabling it.
- Facebook login is not implemented by the current API.

Run the main restaurant API:

```powershell
$env:PORT = "8091"
node pdt.js
```

If the branding API is also needed, start it separately with a different port:

```powershell
$env:PORT = "8092"
node server.js
```

Both services currently use the configured MongoDB URLs. Do not expose the
development MongoDB defaults in production.

## Checks

Run the focused lint checks and test suite with:

```powershell
npm run lint
npm test
```

The lint check currently covers the pricing service and its unit tests.

## Authentication and authorization

Obtain a JWT from `POST /api/login` or `POST /api/register`. Send it on
subsequent requests using either `x-access-token: <token>` or
Use an Authorization bearer header or the x-access-token header. Account-specific API handlers use the account
from the verified token rather than accepting an account identity from the
request.

Passwords are stored as salted PBKDF2 hashes. On successful login, legacy
password records are migrated and plaintext password values are removed.
Catalog and branding write operations require a staff account whose `roles`
array contains an `admin` role. Registration does not grant administrative
privileges. Provision or revoke admin access only through a trusted database
operator; for an existing account, the role shape is
`{ role: "admin" }` in the `staff` collection's `roles` array.

## Authenticated endpoints

The following account-specific endpoints require a valid JWT:

- `GET /api/InProcessOrder`
- `GET /api/PastOrder`
- `GET /api/WalletBalance`
- `GET /api/UserAddress`
- `POST /api/SaveUserAddress`
- `GET /api/GetUpdateUserAddress`
- `POST /api/UpdateUserAddress`
- `POST /api/addToCart`
- `POST /api/AddToFavourite`
- `POST /api/AddToComments`

## Checkout and orders

Checkout prices are recalculated from the current menu on the server.
Amounts in payment requests and responses are integer paise (INR); the
configured policy has no taxes, delivery fee, or coupons.

- `POST /api/checkout/quote` accepts `items`, or an owned `cartId`, and returns
  a server-calculated quote and wallet balance.
- `POST /api/checkout` accepts the same item/cart selection plus one of
  `cod`, `razorpay`, `wallet`, `wallet_cod`, or `wallet_razorpay`. Include a
  unique `Idempotency-Key` header for each checkout attempt.
- Item lines use `{ "itemId": 123, "quantityId": 1, "quantity": 2 }`.
  `quantityId` is required when an item has multiple menu quantity options.
  Client-supplied prices and totals are ignored.
- Razorpay payments are verified at
  `POST /api/payments/razorpay/verify`; configure
  `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`,
  then register `/api/payments/razorpay/webhook` with the provider.
- Customers can read an owned order at `GET /api/orders/:orderId` and request
  cancellation at `POST /api/orders/:orderId/cancel`. Admin order listing,
  status changes, and COD/online refund operations require an admin role.

Wallet debits and refunds use MongoDB transactions. The configured MongoDB
deployment must support transactions (normally a replica set or sharded
cluster); this has not been verified for the production deployment. If the
database does not support transactions, wallet-dependent operations fail
closed. No production-readiness claim is made until database integration and
Razorpay sandbox/retry testing are completed.
