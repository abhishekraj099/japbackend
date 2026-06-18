# JAP Backend

Japanese Learning App - Backend API

## Setup

```bash
npm install
cp .env.example .env
npm run db:push
npm run dev
```

## Project Structure

```
src/
├── config/          # Configuration files (env, database, logger)
├── modules/         # Feature modules (auth, users, decks, cards, reviews)
├── middleware/      # Express middleware
├── lib/             # Shared libraries (SRS, errors)
├── types/           # TypeScript type definitions
└── app.ts           # Express app setup

prisma/
├── schema.prisma    # Database schema
└── migrations/      # Database migrations

tests/               # Test files
└── unit/            # Unit tests
└── integration/     # Integration tests
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run production build
- `npm test` - Run tests
- `npm run test:coverage` - Run tests with coverage
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema to database
- `npm run db:studio` - Open Prisma Studio

## API Routes

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/users/profile` - Get user profile
- `PATCH /api/users/profile` - Update profile
- `DELETE /api/users/account` - Delete account
- `POST /api/decks` - Create deck
- `GET /api/decks` - Get all decks
- `PATCH /api/decks/:id` - Update deck
- `DELETE /api/decks/:id` - Delete deck
- `POST /api/cards` - Create card
- `GET /api/cards/deck/:deckId` - Get cards in deck
- `PATCH /api/cards/:id` - Update card
- `DELETE /api/cards/:id` - Delete card
- `GET /api/reviews` - Get user reviews
- `GET /api/reviews/due` - Get due cards
- `POST /api/reviews/submit` - Submit review
