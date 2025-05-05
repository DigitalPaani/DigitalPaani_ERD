const fs = require('fs');
const path = require('path');

const folderPath = './erd_output';
const outputFile = path.join(folderPath, 'completeSystem.puml');

const allFiles = fs.readdirSync(folderPath)
  .filter(file => file.endsWith('.puml') && file !== 'completeSystem.puml');

let content = `@startuml CompleteSystemErd\n`;

for (const file of allFiles) {
  content += `!include ${file}\n`;
}

content += `\n@enduml\n`;

fs.writeFileSync(outputFile, content);
console.log('✅ completeSystem.puml has been generated.');
