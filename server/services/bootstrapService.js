/**
 * services/bootstrapService.js
 *
 * Seeds essential non-credential data on first startup:
 *  - A placeholder Patient document (no User / credentials attached)
 *  - Sample tasks for that patient
 *
 * No demo users, no hardcoded passwords.
 * Real users are created exclusively through POST /api/auth/register.
 */

const Patient = require('../models/Patient');
const Task    = require('../models/Task');

/**
 * Ensure at least one Patient document exists (for demo / dev use).
 * In production, patients are created via the registration flow.
 *
 * @returns {Promise<import('../models/Patient').default>}
 */
const ensureDemoData = async () => {
  let patient = await Patient.findOne();

  if (!patient) {
    patient = await Patient.create({
      name:             'Demo Patient',
      age:              70,
      riskScore:        0,
      currentState:     'STABLE',
      lastActivityTime: new Date(),
      caregivers:       []
    });

    console.log(`📋 Demo patient created (id: ${patient._id})`);
    console.log('   Register a real account via POST /api/auth/register to link a user.');
  }

  const taskCount = await Task.countDocuments({ patientId: patient._id });
  if (taskCount === 0) {
    const now = new Date();

    await Task.insertMany([
      {
        patientId:     patient._id,
        title:         'Take morning blood pressure medicine',
        type:          'medication',
        scheduledTime: new Date(now.getTime() + 2  * 60_000),
        status:        'pending'
      },
      {
        patientId:     patient._id,
        title:         'Lunch and hydration check',
        type:          'meal',
        scheduledTime: new Date(now.getTime() + 10 * 60_000),
        status:        'pending'
      },
      {
        patientId:     patient._id,
        title:         'Physical therapy video call',
        type:          'appointment',
        scheduledTime: new Date(now.getTime() + 20 * 60_000),
        status:        'pending'
      }
    ]);

    console.log('📝 Sample tasks seeded for demo patient.');
  }

  return patient;
};

module.exports = { ensureDemoData };
