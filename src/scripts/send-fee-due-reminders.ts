import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { env } from '../config/env';
import { sendFeeDueNotifications } from '../services/notifications';

async function main() {
  await connectDB(env.MONGODB_URI);
  const result = await sendFeeDueNotifications();
  console.log(`Sent fee due reminders for ${result.month} to ${result.parentCount} parent accounts`);
}

main()
  .catch((error) => {
    console.error('Fee due reminder job failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
