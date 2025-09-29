# MyMech Autocare

Backend of Automobile service management system with real-time tracking and role-based dashboards.

## Installation

```bash
# Clone repository
git clone https://github.com/Renuja-7671/MyMechAutocareBackend.git
cd MyMechAutocareBackend

# Install backend dependencies
cd MyMechAutocareBackend
npm install

```

## Setup

Create `MyMechAutocareBackend/.env`:
```env
DATABASE_URL="postgresql://user:password@host:port/database"
JWT_SECRET=your_secret_key_here
PORT=5000
```

Setup database:
```bash
cd MyMechAutocareBackend
npx prisma generate
npx prisma migrate dev
npm run prisma:seed
```

## Run

```bash
# Terminal 2 - Backend
cd MyMechAutocareBackend
node server.js


## Test Accounts

- Customer: john.doe@email.com / password123
- Employee: mike.johnson@autoservice.com / password123
- Admin: admin@autoservice.com / password123

## Tech Stack

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-563D7C?style=for-the-badge&logo=bootstrap&logoColor=white)
