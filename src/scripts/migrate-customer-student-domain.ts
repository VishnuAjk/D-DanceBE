import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { env } from '../config/env';

function db() {
  const database = mongoose.connection.db;

  if (!database) {
    throw new Error('MongoDB connection is not ready');
  }

  return database;
}

async function collectionExists(name: string) {
  const collections = await db()
    .listCollections({ name }, { nameOnly: true })
    .toArray();
  return collections.length > 0;
}

async function renameCollectionIfNeeded(from: string, to: string) {
  const hasFrom = await collectionExists(from);
  const hasTo = await collectionExists(to);

  if (hasFrom && !hasTo) {
    await db().collection(from).rename(to);
    return 'renamed';
  }

  return hasTo ? 'already_exists' : 'missing_source';
}

async function renameField(collectionName: string, from: string, to: string) {
  if (!(await collectionExists(collectionName))) {
    return 0;
  }

  const result = await db().collection(collectionName).updateMany(
    { [from]: { $exists: true }, [to]: { $exists: false } },
    { $rename: { [from]: to } }
  );

  return result.modifiedCount;
}

async function dropIndexIfExists(collectionName: string, indexName: string) {
  if (!(await collectionExists(collectionName))) {
    return 'missing_collection';
  }

  const collection = db().collection(collectionName);
  const indexes = await collection.indexes();

  if (!indexes.some((index) => index.name === indexName)) {
    return 'missing_index';
  }

  await collection.dropIndex(indexName);
  return 'dropped';
}

async function createIndexIfCollectionExists(
  collectionName: string,
  keys: Record<string, 1 | -1>,
  options?: { name?: string; unique?: boolean; sparse?: boolean }
) {
  if (!(await collectionExists(collectionName))) {
    return 'missing_collection';
  }

  const collection = db().collection(collectionName);
  const indexes = await collection.indexes();

  if (options?.name && indexes.some((index) => index.name === options.name)) {
    return 'already_exists';
  }

  await collection.createIndex(keys, options);
  return 'created_or_existing';
}

async function setDefaultRelationship() {
  if (!(await collectionExists('studentprofiles'))) {
    return 0;
  }

  const result = await db().collection('studentprofiles').updateMany(
    { relationshipToCustomer: { $exists: false } },
    { $set: { relationshipToCustomer: 'child' } }
  );

  return result.modifiedCount;
}

async function migrate() {
  await connectDB(env.MONGODB_URI);

  const collectionStatus = await renameCollectionIfNeeded('children', 'studentprofiles');
  const droppedLegacyIndexes = {
    enrollmentsChildBatch: await dropIndexIfExists('enrollments', 'childId_1_batchId_1'),
    attendanceChildBatchDate: await dropIndexIfExists('attendances', 'childId_1_batchId_1_date_1'),
    studentprofilesParentNameDob: await dropIndexIfExists('studentprofiles', 'parentId_1_name_1_dob_1')
  };

  const fieldUpdates = {
    users: await db()
      .collection('users')
      .updateMany({ role: 'parent' }, { $set: { role: 'customer' } }),
    studentprofilesCustomerId: await renameField('studentprofiles', 'parentId', 'customerId'),
    enrollmentsStudentProfileId: await renameField('enrollments', 'childId', 'studentProfileId'),
    attendanceStudentProfileId: await renameField('attendances', 'childId', 'studentProfileId'),
    assessmentsStudentProfileId: await renameField('assessments', 'childId', 'studentProfileId'),
    assessmentsSharedFlag: await renameField('assessments', 'sharedWithParent', 'sharedWithCustomer'),
    feeLedgersStudentProfileId: await renameField('feeledgers', 'childId', 'studentProfileId'),
    paymentsStudentProfileId: await renameField('payments', 'childId', 'studentProfileId'),
    paymentsCustomerId: await renameField('payments', 'parentId', 'customerId'),
    relationshipDefaults: await setDefaultRelationship()
  };
  const createdIndexes = {
    studentprofilesCustomerNameDob: await createIndexIfCollectionExists(
      'studentprofiles',
      { customerId: 1, name: 1, dob: 1 },
      { name: 'customerId_1_name_1_dob_1' }
    ),
    enrollmentsStudentBatch: await createIndexIfCollectionExists(
      'enrollments',
      { studentProfileId: 1, batchId: 1 },
      { name: 'studentProfileId_1_batchId_1', unique: true }
    ),
    attendanceStudentBatchDate: await createIndexIfCollectionExists(
      'attendances',
      { studentProfileId: 1, batchId: 1, date: 1 },
      { name: 'studentProfileId_1_batchId_1_date_1', unique: true }
    ),
    feeLedgersStudentProfile: await createIndexIfCollectionExists(
      'feeledgers',
      { studentProfileId: 1 },
      { name: 'studentProfileId_1' }
    ),
    paymentsStudentProfile: await createIndexIfCollectionExists(
      'payments',
      { studentProfileId: 1 },
      { name: 'studentProfileId_1', sparse: true }
    ),
    paymentsCustomer: await createIndexIfCollectionExists(
      'payments',
      { customerId: 1 },
      { name: 'customerId_1', sparse: true }
    )
  };

  console.log('Customer/student domain migration complete');
  console.log(JSON.stringify({ collectionStatus, droppedLegacyIndexes, fieldUpdates, createdIndexes }, null, 2));
}

migrate()
  .catch((error) => {
    console.error('Customer/student domain migration failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
