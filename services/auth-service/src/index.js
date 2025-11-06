// services/auth-service/src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET not set in environment');
  process.exit(1);
}

/**
 * Helper: create user + profile (customer or employee) in one transaction
 */
async function createUserWithProfile({ email, password, role, profile }) {
  const password_hash = await bcrypt.hash(password, 10);
  return prisma.$transaction(async (tx) => {
    // Prisma client expects camelCase JS keys even if DB columns are snake_case.
    const userData = {
      email,
      passwordHash: password_hash,
      role
    };
    console.log('Creating user with data:', userData);
    const user = await tx.user.create({ data: userData });

    if (role === 'customer') {
      await tx.customer.create({
        data: {
          userId: user.id,
          firstName: profile?.first_name ?? '',
          lastName: profile?.last_name ?? '',
          phone: profile?.phone ?? null,
          address: profile?.address ?? null,
          city: profile?.city ?? null,
          postalCode: profile?.postal_code ?? null,
          dateOfBirth: profile?.date_of_birth ? new Date(profile.date_of_birth) : null
        }
      });
    } else if (role === 'employee') {
      await tx.employee.create({
        data: {
          userId: user.id,
          firstName: profile?.first_name ?? '',
          lastName: profile?.last_name ?? '',
          phone: profile?.phone ?? null,
          department: profile?.department ?? null,
          position: profile?.position ?? null,
          hireDate: profile?.hire_date ? new Date(profile.hire_date) : new Date(),
          hourlyRate: profile?.hourly_rate ? parseFloat(profile.hourly_rate) : null
        }
      });
    }

    return { id: user.id, email: user.email, role: user.role };
  });
}

/**
 * POST /api/v1/auth/register
 * Body: { email, password, role, profile: { first_name, last_name, ... } }
 */
app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { email, password, role, profile } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({ status: 'error', message: 'email, password, and role are required' });
    }

  const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ status: 'error', message: 'User already exists' });
    }

  const user = await createUserWithProfile({ email, password, role, profile });
    return res.status(201).json({ status: 'success', data: user });
  } catch (err) {
    console.error('❌ Register error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 */
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'email and password are required' });
    }

  const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

  // Prisma client may return camelCase keys; accept either.
  const storedHash = user.passwordHash || user.password_hash;
  const match = await bcrypt.compare(password, storedHash);
    if (!match) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      status: 'success',
      data: {
        token,
        user: { id: user.id, email: user.email, role: user.role }
      }
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

/**
 * GET /api/v1/users/me
 * Auth: Bearer <token>
 */
app.get('/api/v1/users/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: true,
        employee: true
      }
    });

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const profile = user.customer || user.employee || null;

    return res.json({
      status: 'success',
      data: { user: { id: user.id, email: user.email, role: user.role }, profile }
    });
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
  }
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Auth service running on http://localhost:${PORT}`);
});