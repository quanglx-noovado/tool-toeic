const fs = require('fs');
const path = require('path');

const METADATA_FILE = path.join(__dirname, '..', 'audio', 'metadata.json');

// Load metadata
function loadMetadata() {
  try {
    if (fs.existsSync(METADATA_FILE)) {
      const data = fs.readFileSync(METADATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading metadata:', error);
  }
  return {
    parts: {
      part1: [],
      part2: [],
      part3: [],
      part4: []
    },
    fullLC: []
  };
}

// Save metadata
function saveMetadata(metadata) {
  try {
    const audioDir = path.dirname(METADATA_FILE);
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving metadata:', error);
    return false;
  }
}

// Add part segment
function addPartSegment(part, segment) {
  const metadata = loadMetadata();
  if (!metadata.parts[`part${part}`]) {
    metadata.parts[`part${part}`] = [];
  }
  metadata.parts[`part${part}`].push(segment);
  saveMetadata(metadata);
  return metadata;
}

// Add full LC entry
function addFullLCEntry(entry) {
  const metadata = loadMetadata();
  metadata.fullLC.push(entry);
  saveMetadata(metadata);
  return metadata;
}

// Get part segments
function getPartSegments(part) {
  const metadata = loadMetadata();
  return metadata.parts[`part${part}`] || [];
}

// Get all metadata
function getAllMetadata() {
  return loadMetadata();
}

module.exports = {
  loadMetadata,
  saveMetadata,
  addPartSegment,
  addFullLCEntry,
  getPartSegments,
  getAllMetadata
};
