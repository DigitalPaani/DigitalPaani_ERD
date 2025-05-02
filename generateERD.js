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
  if (Buffer.isBuffer(value)) return 'binary';
  if (value instanceof ObjectId) return 'objectId';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && value !== null) return 'object';
  return 'unknown';
}

function formatEntityName(name) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9]/g, '_');
  const formatted = cleaned.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
  // Add underscore if it starts with a digit
  return /^[0-9]/.test(formatted) ? `_${formatted}` : formatted;
}


function processDocument(doc, name, entities, relationships, parent = null, relationName = null) {
  const entityName = formatEntityName(name);
  if (!entities[entityName]) entities[entityName] = {};

  Object.entries(doc).forEach(([key, value]) => {
    const type = inferType(value);
    if (type === 'object' && value !== null && !Array.isArray(value)) {
      const subEntity = formatEntityName(key);
      relationships.push(`${entityName} ||--|| ${subEntity} : has_${key}`);
      processDocument(value, key, entities, relationships, entityName, key);
      entities[entityName][key] = 'object';
    } else if (type === 'array') {
      const first = value[0];
      if (typeof first === 'object' && first !== null) {
        const subEntity = formatEntityName(key);
        relationships.push(`${entityName} ||--o{ ${subEntity} : has_${key}`);
        processDocument(first, key, entities, relationships, entityName, key);
        entities[entityName][key] = 'list';
      } else {
        entities[entityName][key] = 'list';
      }
    } else {
      entities[entityName][key] = type;
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
    const docs = await db.collection(name).find().limit(SAMPLE_LIMIT).toArray();
    if (docs.length === 0) continue;

    const entities = {};
    const relationships = [];

    processDocument(docs[0], name, entities, relationships);

    const lines = [`@startuml ${formatEntityName(name)}_Diagram`, ''];
    for (const [entity, fields] of Object.entries(entities)) {
      const label = entity.replace(/_/g, ' ').replace(/\s+/g, ' ').trim(); // fix spacing
      lines.push(`entity "${label}" as ${entity} {`);
      for (const [field, type] of Object.entries(fields)) {
        lines.push(`  ${field} : ${type}`);
      }
      lines.push('}\n');
    }
    

    if (relationships.length > 0) {
      lines.push("' // Relationships");
      lines.push(...relationships);
    }

    lines.push('@enduml');

    const filename = `${formatEntityName(name)}.puml`;
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), lines.join('\n'), 'utf8');
    console.log(`Generated: ${filename}`);
  }

  await client.close();
}

main().catch(console.error);
