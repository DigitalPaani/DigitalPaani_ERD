const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config();

const dbName = process.env.DB_NAME;
const uri = process.env.MONGO_URI;

// Reusable function to drop a collection
async function dropCollection(client, dbName, collectionName) {
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    try {
        const result = await collection.drop();
        console.log(`Collection '${collectionName}' dropped successfully from database '${dbName}'.`);
    } catch (error) {
        if (error.codeName === 'NamespaceNotFound') {
            console.log(`Collection '${collectionName}' does not exist in database '${dbName}'.`);
        } else {
            console.error(`Error dropping collection '${collectionName}':`, error);
        }
    }
}

// Main function to find and drop matching collections
async function dropMatchingCollections() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();

        for (const collection of collections) {
            if (/^tickets_?[a-f0-9]+$/.test(collection.name)) {
                await dropCollection(client, dbName, collection.name);
            }
        }
    } catch (error) {
        console.error('Error dropping matching collections:', error);
    } finally {
        await client.close();
    }
}

// Execute
dropMatchingCollections();
