const prisma = require('../config/database');

const userModel = {
  // Find user by email
  async findByEmail(email) {
    return await prisma.user.findUnique({
      where: { email },
      include: {
        customer: true,
        employee: true,
      },
    });
  },

  // Find user by ID
  async findById(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            address: true,
            city: true,
            postalCode: true,
          },
        },
        employee: {
          select: {
            firstName: true,
            lastName: true,
            department: true,
            position: true,
            phone: true,
            isAvailable: true,
          },
        },
      },
    });
  },

  // Create new user with profile
  async createUser(userData) {
    const { email, passwordHash, role, firstName, lastName, phone, address, department, position } = userData;

    return await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role,
        },
      });

      // Create role-specific profile
      if (role === 'customer') {
        await tx.customer.create({
          data: {
            userId: user.id,
            firstName,
            lastName,
            phone,
            address,
          },
        });
      } else if (role === 'employee') {
        await tx.employee.create({
          data: {
            userId: user.id,
            firstName,
            lastName,
            phone,
            department,
            position,
            hireDate: new Date(),
          },
        });
      }

      return user;
    });
  },

  // Check if email exists
  async emailExists(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return !!user;
  },
};

module.exports = userModel;