import { db, tweets } from '@comifuro/core';

async function testDatabase() {
  console.log('Testing database connection...');

  // Test inserting a sample tweet
  await db.insert(tweets).values({
    id: '1234567890',
    user: 'testuser',
    timestamp: new Date(),
    text: 'This is a test tweet',
    imageMask: 0b101, // images 0 and 2
  });

  console.log('Inserted test tweet');

  // Test querying
  const result = await db.select().from(tweets);
  console.log('Current tweets in database:', result);

  console.log('Database test completed successfully!');
}

if (import.meta.main) {
  testDatabase().catch(console.error);
}