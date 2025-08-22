# iTemplate – Inventory Management System

Full‑stack inventory management boilerplate with authentication, real‑time updates, media uploads, robust API, and a modern React front‑end.

## Stack

- **Client**: React 19, Vite, React Router, React Query, Tailwind, Axios, Socket.IO client, i18next
- **Server**: Node.js, Express, Sequelize (PostgreSQL), Passport (JWT, Google, GitHub), Socket.IO, Multer + Cloudinary, Helmet, Rate Limiting, Compression, Winston/Morgan

## Monorepo Structure

```
itemplate/
├─ .gitignore
├─ README.md
├─ client/
│  ├─ .env
│  ├─ dist/
│  ├─ eslint.config.js
│  ├─ index.html
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ public/
│  │  └─ vite.svg
│  ├─ src/
│  │  ├─ App.css
│  │  ├─ App.jsx
│  │  ├─ api/
│  │  │  └─ endpoints.js
│  │  ├─ assets/
│  │  │  └─ react.svg
│  │  ├─ components/
│  │  │  ├─ Inventory/
│  │  │  │  └─ InventoryCard.jsx
│  │  │  ├─ Layout/
│  │  │  │  └─ Navbar.jsx
│  │  │  ├─ Search/
│  │  │  │  └─ SearchBar.jsx
│  │  │  └─ UI/
│  │  │     ├─ LanguageSelector.jsx
│  │  │     ├─ LoadingSpinner.jsx
│  │  │     └─ TagCloud.jsx
│  │  ├─ contexts/
│  │  │  ├─ AuthContext.jsx
│  │  │  ├─ SocketContext.jsx
│  │  │  └─ ThemeContext.jsx
│  │  ├─ i18n/
│  │  │  ├─ config.js
│  │  │  └─ locales/
│  │  │     ├─ en.json
│  │  │     └─ es.json
│  │  ├─ index.css
│  │  ├─ main.jsx
│  │  ├─ pages/
│  │  │  ├─ AdminPage.jsx
│  │  │  ├─ AuthSuccess.jsx
│  │  │  ├─ CreateInventoryPage.jsx
│  │  │  ├─ CreateItemPage.jsx
│  │  │  ├─ EditInventoryPage.jsx
│  │  │  ├─ HomePage.jsx
│  │  │  ├─ InventoryDetailPage.jsx
│  │  │  ├─ InventoryListPage.jsx
│  │  │  ├─ ItemDetailPage.jsx
│  │  │  ├─ LoginPage.jsx
│  │  │  ├─ NotFoundPage.jsx
│  │  │  ├─ ProfilePage.jsx
│  │  │  └─ SearchResultsPage.jsx
│  │  └─ setupAxios.js
│  └─ vite.config.js
└─ server/
   ├─ .env
   ├─ config/
   │  ├─ database.js
   │  └─ passport.js
   ├─ models/
   │  └─ index.js
   ├─ package-lock.json
   ├─ package.json
   ├─ routes/
   │  ├─ auth.js
   │  ├─ categories.js
   │  ├─ comments.js
   │  ├─ inventories.js
   │  ├─ items.js
   │  ├─ search.js
   │  ├─ tags.js
   │  └─ users.js
   ├─ server.js
   └─ utils/
```

## Features

- **Auth**: JWT, Google OAuth, GitHub OAuth; admin auto‑assignment via `ADMIN_EMAILS`
- **Inventories**: CRUD, image upload (Cloudinary), categories, tags, access control, custom ID formats, custom fields
- **Items**: CRUD, custom ID generator, likes, pagination, optimistic locking, uploads
- **Comments**: CRUD with real‑time events
- **Search**: Full‑text style search across inventories/items
- **Real‑time**: Socket.IO rooms per inventory for item/comment events
- **Security**: Helmet, rate limiting, sessions (Sequelize store), CORS, error handling

## Prerequisites

- Node.js 18+
- PostgreSQL database
- Cloudinary account (for image uploads)

## Environment Variables

Create a `.env` in `server/` with:

```
# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173   # Vite dev server
SESSION_SECRET=replace-with-strong-secret
JWT_SECRET=replace-with-strong-jwt-secret
ADMIN_EMAILS=admin1@example.com,admin2@example.com

# Database (Sequelize reads DATABASE_URL from config)
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME

# OAuth (optional but supported)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Cloudinary (uploads)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Create a `.env` in `client/` (optional) with:

```
VITE_SERVER_URL=http://localhost:5000
```

`client/src/setupAxios.js` reads `VITE_SERVER_URL` and attaches the auth token from `localStorage`.

## Install & Run

From repo root, in two terminals:

1) Server

```
cd server
npm install
npm run dev
```

2) Client

```
cd client
npm install
npm run dev
```

- Client runs on `http://localhost:5173` (Vite)
- Server runs on `http://localhost:5000`

## NPM Scripts

Server (`server/package.json`):

- `start` – production start
- `dev` – nodemon
- `migrate` – `sequelize-cli db:migrate`
- `seed` – `sequelize-cli db:seed:all`

Client (`client/package.json`):

- `dev` – Vite dev server
- `build` – production bundle
- `preview` – preview built app
- `lint` – ESLint

## API Overview

Base URL: `/api`

- **Auth** (`/auth`)
  - `GET /status` – simple health check
  - `POST /register` – `{ username, email, password, firstName?, lastName? }` → `{ token }`
  - `POST /login` – `{ email, password }` → `{ token }`
  - `GET /google` / `GET /github` – OAuth start
  - `GET /google/callback`, `GET /github/callback` – redirects to `CLIENT_URL/auth/success?token=...`
  - `GET /me` – current user (Bearer token)
  - `PUT /preferences` – update `language`, `theme` (Bearer token)
  - `POST /logout`

- **Users** (`/users`)
  - `GET /` – list users (admin)
  - `GET /:id` – user profile
  - `GET /:id/inventories` – inventories for user (self/admin)
  - `PUT /:id/block` – toggle block (admin)
  - `PUT /:id/admin` – toggle admin (admin)
  - `DELETE /:id` – delete (admin)
  - `GET /search/autocomplete?q=` – user autocomplete (auth)

- **Categories** (`/categories`)
  - `GET /` – list categories

- **Tags** (`/tags`)
  - `GET /` – tag cloud with counts
  - `GET /autocomplete?q=` – tag name suggestions
  - `GET /:tagName/inventories` – inventories for tag

- **Inventories** (`/inventories`)
  - `GET /` – paginated list with filters: `page, limit, category, tags, search, sortBy, sortOrder`
  - `GET /latest` – newest
  - `GET /popular` – by item count
  - `GET /:id` – details (+ accessUsers, tags)
  - `POST /upload` – multipart `image` → Cloudinary URL (auth)
  - `POST /` – create (auth, multipart optional `image` or `imageUrl`)
  - `PUT /:id` – update with optimistic locking via `version` (auth)
  - `DELETE /:id` – delete (auth, owner/admin)
  - `POST /:id/access` – manage access (auth) [see route for payload]

- **Items** (`/items`)
  - `GET /inventory/:inventoryId` – items in inventory; supports search/pagination
  - `GET /:id` – item details (+ like info)
  - `POST /upload` – multipart `file` → Cloudinary URL (auth)
  - `POST /` – create (auth; generates `customId` from inventory format)
  - `PUT /:id` – update with optimistic locking (auth)
  - `DELETE /:id` – delete (auth)
  - `POST /:id/like` – like/unlike (auth)

- **Comments** (`/comments`)
  - `GET /inventory/:inventoryId` – list comments (paginated)
  - `POST /` – create (auth)
  - `PUT /:id` – update (author/admin)
  - `DELETE /:id` – delete (author/admin)

- **Search** (`/search`)
  - `GET /?q=term&type=all|inventories|items&page=&limit=` – returns inventories/items

## Data Model (simplified)

- `User` – auth fields, roles, preferences
- `Inventory` – title, description, image, `customIdFormat` (array), `customFields` (JSON), `isPublic`, `version`
- `Item` – `customId` (unique per inventory), `customFields` (JSON), `version`, likes
- `Comment` – `content`, relations to `Inventory` and `User`
- `Category`, `Tag`, join tables: `InventoryTag`, `InventoryAccess`, `ItemLike`

## Real‑time Events

Socket.IO namespace: default; room per inventory ID.

- `itemCreated`, `itemUpdated`, `itemDeleted`
- `commentAdded`, `commentUpdated`, `commentDeleted`

## CORS / Base URLs

- Server CORS and Socket.IO allow `CLIENT_URL` or `http://localhost:3000` by default. Set `CLIENT_URL` to your client origin (e.g., `http://localhost:5173`).
- Client Axios base URL reads `VITE_SERVER_URL`.

## Notes

- In non‑production, `server/server.js` calls `sequelize.sync({ alter: true })` for convenience. Use migrations in production (`npm run migrate`).
- Images use Cloudinary via Multer storage; ensure credentials are set.
- Admin bootstrap via `ADMIN_EMAILS`.

## License

ISC
