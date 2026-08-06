const fs = require('fs');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx')) {
          results.push(file);
      }
    }
  });
  return results;
}

const files = walk('src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf-8');
  let originalContent = content;
  
  // Basic regex to find <img ... > or <img ... />
  // We want to add loading="lazy" if it doesn't exist
  content = content.replace(/<img([^>]+)>/g, (match, p1) => {
    if (!p1.includes('loading=')) {
      if (p1.endsWith('/')) {
        return `<img${p1.slice(0, -1)} loading="lazy" />`;
      } else {
        return `<img${p1} loading="lazy">`;
      }
    }
    return match;
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log(`Updated images in ${file}`);
  }
});
