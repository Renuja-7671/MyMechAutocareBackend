const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Hash password for all test users
  const hashedPassword = await bcrypt.hash('password123', 12);

  // ============================================
  // USERS & PROFILES
  // ============================================

  // Admin User
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@autoservice.com',
      passwordHash: hashedPassword,
      role: 'admin',
    },
  });
  console.log('Created admin user');

  // Customer 1
  const customer1User = await prisma.user.create({
    data: {
      email: 'john.doe@email.com',
      passwordHash: hashedPassword,
      role: 'customer',
      customer: {
        create: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '555-0101',
          address: '123 Main Street',
          city: 'Springfield',
          postalCode: '12345',
          dateOfBirth: new Date('1990-05-15'),
        },
      },
    },
  });
  console.log('Created customer 1');

  // Customer 2
  const customer2User = await prisma.user.create({
    data: {
      email: 'jane.smith@email.com',
      passwordHash: hashedPassword,
      role: 'customer',
      customer: {
        create: {
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '555-0102',
          address: '456 Oak Avenue',
          city: 'Springfield',
          postalCode: '12346',
          dateOfBirth: new Date('1985-08-22'),
        },
      },
    },
  });
  console.log('Created customer 2');

  // Employee 1 - Mechanic
  const employee1User = await prisma.user.create({
    data: {
      email: 'mike.johnson@autoservice.com',
      passwordHash: hashedPassword,
      role: 'employee',
      employee: {
        create: {
          firstName: 'Mike',
          lastName: 'Johnson',
          phone: '555-0201',
          department: 'Service',
          position: 'Senior Mechanic',
          hireDate: new Date('2020-01-15'),
          hourlyRate: 35.00,
          isAvailable: true,
        },
      },
    },
  });
  console.log('Created employee 1');

  // Employee 2 - Technician
  const employee2User = await prisma.user.create({
    data: {
      email: 'sarah.williams@autoservice.com',
      passwordHash: hashedPassword,
      role: 'employee',
      employee: {
        create: {
          firstName: 'Sarah',
          lastName: 'Williams',
          phone: '555-0202',
          department: 'Service',
          position: 'Technician',
          hireDate: new Date('2021-06-01'),
          hourlyRate: 28.00,
          isAvailable: true,
        },
      },
    },
  });
  console.log('Created employee 2');

  // ============================================
  // VEHICLES
  // ============================================

  const customer1 = await prisma.customer.findUnique({
    where: { userId: customer1User.id },
  });

  const customer2 = await prisma.customer.findUnique({
    where: { userId: customer2User.id },
  });

  const vehicle1 = await prisma.vehicle.create({
    data: {
      customerId: customer1.id,
      make: 'Toyota',
      model: 'Camry',
      year: 2020,
      vin: '1HGBH41JXMN109186',
      licensePlate: 'ABC123',
      color: 'Silver',
      mileage: 35000,
    },
  });
  console.log('Created vehicle 1');

  const vehicle2 = await prisma.vehicle.create({
    data: {
      customerId: customer1.id,
      make: 'Honda',
      model: 'CR-V',
      year: 2019,
      vin: '2HGFC2F59HH123456',
      licensePlate: 'XYZ789',
      color: 'Blue',
      mileage: 42000,
    },
  });
  console.log('Created vehicle 2');

  const vehicle3 = await prisma.vehicle.create({
    data: {
      customerId: customer2.id,
      make: 'Ford',
      model: 'F-150',
      year: 2021,
      vin: '1FTFW1E59MFA12345',
      licensePlate: 'DEF456',
      color: 'Black',
      mileage: 28000,
    },
  });
  console.log('Created vehicle 3');

  // ============================================
  // SERVICES
  // ============================================

  const services = await prisma.service.createMany({
    data: [
      {
        name: 'Oil Change',
        description: 'Standard oil and filter change',
        category: 'Maintenance',
        estimatedDuration: 30,
        basePrice: 49.99,
      },
      {
        name: 'Brake Inspection',
        description: 'Complete brake system inspection',
        category: 'Safety',
        estimatedDuration: 45,
        basePrice: 79.99,
      },
      {
        name: 'Tire Rotation',
        description: 'Rotate all four tires',
        category: 'Maintenance',
        estimatedDuration: 30,
        basePrice: 39.99,
      },
      {
        name: 'Engine Diagnostic',
        description: 'Computer diagnostic scan',
        category: 'Diagnostic',
        estimatedDuration: 60,
        basePrice: 99.99,
      },
      {
        name: 'Transmission Service',
        description: 'Transmission fluid change and inspection',
        category: 'Maintenance',
        estimatedDuration: 90,
        basePrice: 149.99,
      },
    ],
  });
  console.log('Created services');

  // Get service IDs
  const oilChangeService = await prisma.service.findFirst({
    where: { name: 'Oil Change' },
  });

  const brakeService = await prisma.service.findFirst({
    where: { name: 'Brake Inspection' },
  });

  // ============================================
  // APPOINTMENTS
  // ============================================

  const appointment1 = await prisma.appointment.create({
    data: {
      customerId: customer1.id,
      vehicleId: vehicle1.id,
      serviceId: oilChangeService.id,
      scheduledDate: new Date('2025-10-05T10:00:00'),
      status: 'scheduled',
      notes: 'Customer requested synthetic oil',
    },
  });
  console.log('Created appointment 1');

  const appointment2 = await prisma.appointment.create({
    data: {
      customerId: customer2.id,
      vehicleId: vehicle3.id,
      serviceId: brakeService.id,
      scheduledDate: new Date('2025-10-06T14:00:00'),
      status: 'confirmed',
      notes: 'Customer reported squeaking noise',
    },
  });
  console.log('Created appointment 2');

  // ============================================
  // PROJECTS
  // ============================================

  const project1 = await prisma.project.create({
    data: {
      customerId: customer1.id,
      vehicleId: vehicle2.id,
      title: 'Custom Exhaust Installation',
      description: 'Install performance exhaust system',
      projectType: 'modification',
      status: 'pending',
      priority: 'medium',
      estimatedCost: 1500.00,
    },
  });
  console.log('Created project 1');

  // ============================================
  // PARTS
  // ============================================

  await prisma.part.createMany({
    data: [
      {
        name: 'Engine Oil Filter',
        partNumber: 'OF-001',
        description: 'Standard oil filter',
        category: 'Filters',
        quantityInStock: 50,
        unitPrice: 8.99,
        reorderLevel: 10,
        supplier: 'Auto Parts Inc.',
      },
      {
        name: 'Brake Pads',
        partNumber: 'BP-002',
        description: 'Front brake pads set',
        category: 'Brakes',
        quantityInStock: 25,
        unitPrice: 45.99,
        reorderLevel: 5,
        supplier: 'Brake Masters',
      },
      {
        name: 'Air Filter',
        partNumber: 'AF-003',
        description: 'Engine air filter',
        category: 'Filters',
        quantityInStock: 40,
        unitPrice: 15.99,
        reorderLevel: 10,
        supplier: 'Auto Parts Inc.',
      },
    ],
  });
  console.log('Created parts');

  // ============================================
  // NOTIFICATIONS
  // ============================================

  await prisma.notification.createMany({
    data: [
      {
        userId: customer1User.id,
        title: 'Appointment Confirmed',
        message: 'Your oil change appointment is confirmed for Oct 5, 2025 at 10:00 AM',
        type: 'appointment_reminder',
        relatedEntityType: 'appointment',
        relatedEntityId: appointment1.id,
      },
      {
        userId: customer2User.id,
        title: 'Service Update',
        message: 'Your brake inspection has been scheduled',
        type: 'service_update',
        relatedEntityType: 'appointment',
        relatedEntityId: appointment2.id,
      },
    ],
  });
  console.log('Created notifications');

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });