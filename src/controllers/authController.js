const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const userModel = require('../models/userModel');

const authController = {
  // Register new user
  async register(req, res) {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, role, firstName, lastName, phone, address, department, position } = req.body;

      // Check if user exists
      const emailExists = await userModel.emailExists(email);
      if (emailExists) {
        return res.status(400).json({ error: 'User already exists with this email' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user with role-specific profile
      const user = await userModel.createUser({
        email,
        passwordHash,
        role,
        firstName,
        lastName,
        phone,
        address,
        department,
        position,
      });

      res.status(201).json({
        message: 'User registered successfully',
        userId: user.id,
        role: user.role,
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  },

  // Login user
  async login(req, res) {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;
      console.log("Login attempt for email:", email);

      // Find user with profile data
      const user = await userModel.findByEmail(email);

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Prepare user data (exclude password)
      const userData = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      // Add role-specific data
      if (user.customer) {
        userData.profile = {
          firstName: user.customer.firstName,
          lastName: user.customer.lastName,
          phone: user.customer.phone,
        };
      } else if (user.employee) {
        userData.profile = {
          firstName: user.employee.firstName,
          lastName: user.employee.lastName,
          department: user.employee.department,
          position: user.employee.position,
        };
      }

      res.json({
        message: 'Login successful',
        token,
        user: userData,
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  },

  // Get current user profile
  async getProfile(req, res) {
    try {
      console.log("Fetching profile for userId:", req.user.userId);
      
      const user = await userModel.findById(req.user.userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ user });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  },
};

module.exports = authController;