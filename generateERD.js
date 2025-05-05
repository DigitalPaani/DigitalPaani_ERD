const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const dotenv = require("dotenv");
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const SAMPLE_LIMIT = 50;
const OUTPUT_DIR = 'erd_output';

function inferType(value) {
  if (
    value instanceof ObjectId ||
    (value &&
      typeof value === 'object' &&
      value._bsontype === 'ObjectID' &&
      Buffer.isBuffer(value.buffer))
  ) {
    return 'ObjectId';
  }

  if (Buffer.isBuffer(value)) return 'binary';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && value !== null) return 'object';
  return 'unknown';
}

function formatEntityName(name) {
  const label = name.trim();
  const alias = label.replace(/[^a-zA-Z0-9]/g, '_');
  return { label, alias };
}

// Global flag, reset per collection
let usesPlant = false;

function processDocument(doc, name, entities, relationships, parent = null, relationName = null) {
  const { label: entityLabel, alias: entityAlias } = formatEntityName(name);
  if (!entities[entityAlias]) entities[entityAlias] = {};

  Object.entries(doc).forEach(([key, value]) => {
    const type = inferType(value);

    if (type === 'object' && value !== null && !Array.isArray(value)) {
      const { alias: subEntityAlias } = formatEntityName(key);
      relationships.push(`${entityAlias} ||--|| ${subEntityAlias} : has_${key}`);
      processDocument(value, key, entities, relationships, entityAlias, key);
      entities[entityAlias][key] = 'object';
    }

    else if (type === 'array') {
      const first = value[0];
      if (typeof first === 'object' && first !== null) {
        const { alias: subEntityAlias } = formatEntityName(key);
        relationships.push(`${entityAlias} ||--o{ ${subEntityAlias} : has_${key}`);
        processDocument(first, key, entities, relationships, entityAlias, key);
        entities[entityAlias][key] = 'list';
      } else {
        entities[entityAlias][key] = 'list';
      }
    }

    else {
      entities[entityAlias][key] = type;

      // Detect plantId and create relationship from *any* entity
      if (key === 'plantId' && type === 'ObjectId') {
        usesPlant = true;
        const rel = `${entityAlias} }o--|| Plants : refers_to`;
        if (!relationships.includes(rel)) relationships.push(rel);
      }
    }
  });
}


async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const collections = await db.listCollections().toArray();

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  for (const { name } of collections) {
    usesPlant = false; // Reset for each collection

    const docs = await db.collection(name).find().limit(SAMPLE_LIMIT).toArray();
    if (docs.length === 0) continue;

    const entities = {};
    const relationships = [];

    processDocument(docs[0], name, entities, relationships);

    const { label: diagramLabel, alias: diagramAlias } = formatEntityName(name);
    const lines = [`@startuml ${diagramAlias}_Diagram`, ''];

    for (const [entity, fields] of Object.entries(entities)) {
      const label = entity.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
      lines.push(`entity "${label}" as ${entity} {`);
      for (const [field, type] of Object.entries(fields)) {
        lines.push(`  ${field} : ${type}`);
      }
      lines.push('}\n');
    }

    if (usesPlant) {
      lines.push(`\n' Shared Plant entity`);
      lines.push(`entity "Plants" as Plants {`);
      lines.push(`  _id : ObjectId`);
      lines.push(`}`);
    }

    if (relationships.length > 0) {
      lines.push(`\n' Relationships`);
      lines.push(...relationships);
    }

    lines.push('@enduml');

    const filename = `${diagramAlias}.puml`;
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), lines.join('\n'), 'utf8');
    console.log(`Generated: ${filename}`);
  }

  await client.close();
}

main().catch(console.error);
