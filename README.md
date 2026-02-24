# NERV COMMUNICATION SYSTEM

An Evangelion-themed real-time chat and calling application. Optimized for secure communication and persistent data storage.

## Features
- **Real-time Chat**: Direct messages and group/community chats.
- **WebRTC Calling**: Secure voice and video calls with ICE candidate queuing for stable connections.
- **Persistent Storage**: Migrated to PostgreSQL for reliable data persistence on platforms like Render.
- **Modern UI**: Styled with NERv aesthetics and glassmorphism.

## Tech Stack
- **Backend**: Node.js, Express, Socket.io
- **Database**: PostgreSQL (Prisma-ready schema)
- **Frontend**: Vanilla JS, WebRTC, CSS3
- **Deployment**: Optimized for Render

## Setup & Deployment

### Environment Variables
To run the server, you must set the following environment variables:
- `DATABASE_URL`: Your PostgreSQL connection string (Neon.tech or Supabase).
- `SESSION_SECRET`: A secure string for session encryption.
- `NODE_ENV`: Set to `production` for secure cookies.

### Database Initialization
The system automatically initializes the database schema upon connection. No manual SQL scripts are required.

### Local Development
1. Clone the repository.
2. Install dependencies: `npm install`
3. Set up your `.env` file with `DATABASE_URL`.
4. Start the server: `npm run dev`

---
*Maintained by the NERV Technical Team.*
