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
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { email, password, name, phone, role = 'customer', address, department, position } = req.body;

      // Split name into firstName and lastName if provided as single field
      let firstName = '';
      let lastName = '';
      if (name) {
        const nameParts = name.trim().split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ') || nameParts[0];
      }

      // Check if user exists
      const emailExists = await userModel.emailExists(email);
      if (emailExists) {
        return res.status(400).json({
          success: false,
          error: 'User already exists with this email'
        });
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
        success: true,
        message: 'User registered successfully',
        userId: user.id,
        role: user.role,
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        error: 'Registration failed. Please try again.'
      });
    }
  },

  // Login user
  async login(req, res) {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { email, password } = req.body;
      console.log("Login attempt for email:", email);

      // Find user with profile data
      const user = await userModel.findByEmail(email);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Account is deactivated'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
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

      // Prepare user data (exclude password) - match frontend expectations
      const userData = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: '', // Will be populated from profile
      };

      // Add role-specific data and populate name
      if (user.customer) {
        userData.name = `${user.customer.firstName} ${user.customer.lastName}`.trim();
        userData.phone = user.customer.phone;
        userData.profile = {
          firstName: user.customer.firstName,
          lastName: user.customer.lastName,
          phone: user.customer.phone,
        };
      } else if (user.employee) {
        userData.name = `${user.employee.firstName} ${user.employee.lastName}`.trim();
        userData.phone = user.employee.phone;
        userData.profile = {
          firstName: user.employee.firstName,
          lastName: user.employee.lastName,
          department: user.employee.department,
          position: user.employee.position,
          phone: user.employee.phone,
        };
      } else if (user.role === 'admin') {
        userData.name = 'Admin';
      }

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          user: userData,
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed. Please try again.'
      });
    }
  },

  // Logout user (optional - frontend can just clear token)
  async logout(req, res) {
    try {
      // In a stateless JWT setup, logout is handled client-side
      // This endpoint exists for consistency but doesn't need to do much
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  },

  // Get current user profile (me endpoint)
  async getProfile(req, res) {
    try {
      console.log("Fetching profile for userId:", req.user.userId);

      const user = await userModel.findById(req.user.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Format user data similar to login response
      const userData = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: '',
      };

      if (user.customer) {
        userData.name = `${user.customer.firstName} ${user.customer.lastName}`.trim();
        userData.phone = user.customer.phone;
        userData.profile = {
          firstName: user.customer.firstName,
          lastName: user.customer.lastName,
          phone: user.customer.phone,
        };
      } else if (user.employee) {
        userData.name = `${user.employee.firstName} ${user.employee.lastName}`.trim();
        userData.phone = user.employee.phone;
        userData.profile = {
          firstName: user.employee.firstName,
          lastName: user.employee.lastName,
          department: user.employee.department,
          position: user.employee.position,
          phone: user.employee.phone,
        };
      } else if (user.role === 'admin') {
        userData.name = 'Admin';
      }

      res.json({
        success: true,
        user: userData
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch profile'
      });
    }
  },
};

module.exports = authController;
