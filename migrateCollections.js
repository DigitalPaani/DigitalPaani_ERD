const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require("dotenv");
dotenv.config();

async function mergeNotifications() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);
    const dbName = process.env.DB_NAME;

    try {
        await client.connect();
        const db = client.db(dbName);
        const allCollections = await db.listCollections().toArray();

        const notificationsCollections = [];
        const skippedCollections = [];

        for (const { name } of allCollections) {
            const match = name.match(/^tickets_?([a-f0-9]+)$/i);
            if (match) {
                console.log(`Matched collection: ${name} → plantId: ${match[1]}`);
                notificationsCollections.push({ name, plantId: match[1] });
            } else {
                console.log(`Skipped collection: ${name}`);
                skippedCollections.push(name);
            }
        }

        for (const { name, plantId } of notificationsCollections) {
            const sourceCollection = db.collection(name);
            const targetCollection = db.collection('notifications');

            const cursor = sourceCollection.find();
            let bulk = [];

            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                doc.plantId = new ObjectId(plantId);

                const exists = await targetCollection.findOne({ _id: doc._id });
                if (!exists) {
                    bulk.push({ insertOne: { document: doc } });
                }
                if (bulk.length >= 500) {
                    await targetCollection.bulkWrite(bulk);
                    bulk = [];
                }
            }
            if (bulk.length) {
                await targetCollection.bulkWrite(bulk);
            }

            console.log(`Merged ${name} into notifications with plantId=${plantId}`);
        }

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await client.close();
    }
}

mergeNotifications();
