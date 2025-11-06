const { body } = require('express-validator');

const registerValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .optional()
    .isIn(['customer', 'employee', 'admin'])
    .withMessage('Invalid role'),
  // Accept either 'name' or 'firstName/lastName'
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name is required'),
  body('firstName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('lastName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('phone')
    .optional()
    .trim(),
  // Custom validation: either 'name' or both 'firstName' and 'lastName' must be provided
  body().custom((value, { req }) => {
    if (!req.body.name && (!req.body.firstName || !req.body.lastName)) {
      throw new Error('Either provide "name" or both "firstName" and "lastName"');
    }
    return true;
  }),
];

const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

module.exports = {
  registerValidation,
  loginValidation,
};
