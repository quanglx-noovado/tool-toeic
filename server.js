const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const audioMetadata = require('./utils/audioMetadata');

const app = express();
const PORT = 3000;

// TOEIC question numbering constants
const TOEIC_QUESTION_RANGES = {
  1: { start: 1, end: 6, count: 6 },
  2: { start: 7, end: 31, count: 25 },
  3: { start: 32, end: 70, count: 39, groupCount: 13, questionsPerGroup: 3 },
  4: { start: 71, end: 100, count: 30, groupCount: 10, questionsPerGroup: 3 }
};

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static('public'));

// Serve audio files from audio directory (if exists)
app.use('/audio', express.static('audio'));

// Serve part audio files
app.use('/part1', express.static('audio/part1'));
app.use('/part2', express.static('audio/part2'));
app.use('/part3', express.static('audio/part3'));
app.use('/part4', express.static('audio/part4'));

// API endpoint to list audio files (root level - for backward compatibility)
app.get('/api/audio-files', (req, res) => {
  const audioDir = path.join(__dirname, 'audio');

  // Check if audio directory exists
  if (!fs.existsSync(audioDir)) {
    return res.json([]);
  }

  try {
    const files = fs.readdirSync(audioDir);
    const audioFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'].includes(ext);
    }).map(file => ({
      name: file,
      url: `/audio/${file}`
    }));

    res.json(audioFiles);
  } catch (error) {
    console.error('Error reading audio directory:', error);
    res.json([]);
  }
});

// API endpoint to list audio files by part number
app.get('/api/audio-files/:part', (req, res) => {
  const part = req.params.part;
  const partDir = path.join(__dirname, 'audio', `part${part}`);

  // Check if part directory exists
  if (!fs.existsSync(partDir)) {
    return res.json([]);
  }

  try {
    const files = fs.readdirSync(partDir);
    const audioFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'].includes(ext);
    }).map(file => ({
      name: file,
      url: `/part${part}/${file}`
    }));

    // Sort files by name (to ensure question order)
    audioFiles.sort((a, b) => a.name.localeCompare(b.name));

    res.json(audioFiles);
  } catch (error) {
    console.error(`Error reading part ${part} audio directory:`, error);
    res.json([]);
  }
});

// Generic manual split function for parts with individual questions (Part 1 & 2)
async function manualSplitPart(req, res, partNumber, expectedCount) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const { timestamps } = req.body;
    if (!timestamps) {
      return res.status(400).json({ error: 'Timestamps are required' });
    }

    const timestampsArray = JSON.parse(timestamps);
    console.log(`[DEBUG] manualSplitPart hit for Part ${partNumber}, count=${timestampsArray.length}, expected=${expectedCount}`);
    if (!Array.isArray(timestampsArray) || timestampsArray.length !== expectedCount) {
      return res.status(400).json({ error: `[MANUAL_INDIVIDUAL] Part ${partNumber} requires exactly ${expectedCount} timestamps` });
    }

    // Validate part number
    const partRange = TOEIC_QUESTION_RANGES[partNumber];
    if (!partRange || partRange.count !== expectedCount) {
      return res.status(400).json({ error: `Invalid part number or count mismatch. Part ${partNumber} should have ${partRange?.count || 'unknown'} questions` });
    }

    const inputFile = req.file.path;
    const originalName = path.parse(req.file.originalname).name;
    const outputDir = path.join(__dirname, 'audio', `part${partNumber}`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Split audio with correct question numbering
    const outputFiles = await splitAudioSegments(inputFile, timestampsArray, outputDir, originalName, partNumber, 'q', partRange.start);

    // Validate final count
    if (outputFiles.length !== expectedCount) {
      return res.status(400).json({
        error: `Expected ${expectedCount} questions but got ${outputFiles.length}`,
        files: outputFiles.length
      });
    }

    // Save metadata with correct question numbers
    const metadataEntry = {
      originalFile: req.file.originalname,
      splitDate: new Date().toISOString(),
      method: 'manual',
      questionRange: `${partRange.start}-${partRange.end}`,
      segments: outputFiles.map(f => ({
        question: f.question,
        filename: f.filename,
        path: `/part${partNumber}/${f.filename}`,
        start: parseFloat(f.start),
        end: parseFloat(f.end)
      }))
    };
    audioMetadata.addPartSegment(partNumber, metadataEntry);

    // Clean up uploaded file
    fs.unlinkSync(inputFile);

    res.json({
      success: true,
      message: `Part ${partNumber} audio split successfully`,
      files: outputFiles
    });

  } catch (error) {
    console.error(`Error splitting Part ${partNumber}:`, error);
    res.status(500).json({ error: error.message || `Failed to split Part ${partNumber}` });
  }
}

// Manual split function for parts with groups (Part 3 & 4)
async function manualSplitPartWithGroups(req, res, partNumber, groupCount, questionsPerGroup) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const { timestamps } = req.body;
    if (!timestamps) {
      return res.status(400).json({ error: 'Timestamps are required' });
    }

    const timestampsArray = JSON.parse(timestamps);
    console.log(`[DEBUG] manualSplitPartWithGroups hit for Part ${partNumber}, count=${timestampsArray.length}, groupCount=${groupCount}`);
    if (!Array.isArray(timestampsArray) || timestampsArray.length !== groupCount) {
      return res.status(400).json({ error: `[MANUAL_GROUP] Part ${partNumber} requires exactly ${groupCount} group timestamps` });
    }

    // Validate part number
    const partRange = TOEIC_QUESTION_RANGES[partNumber];
    if (!partRange || partRange.groupCount !== groupCount) {
      return res.status(400).json({ error: `Invalid part number or group count mismatch. Part ${partNumber} should have ${partRange?.groupCount || 'unknown'} groups` });
    }

    const inputFile = req.file.path;
    const originalName = path.parse(req.file.originalname).name;
    const outputDir = path.join(__dirname, 'audio', `part${partNumber}`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Split audio using manual timestamps
    const outputFiles = await splitAudioSegmentsForGroups(
      inputFile,
      timestampsArray,
      outputDir,
      originalName,
      partNumber,
      partRange.start,
      questionsPerGroup
    );

    // Validate final count
    if (outputFiles.length !== groupCount) {
      return res.status(400).json({
        error: `Expected ${groupCount} groups but got ${outputFiles.length}`,
        files: outputFiles.length
      });
    }

    // Save metadata with correct question ranges
    const metadataEntry = {
      originalFile: req.file.originalname,
      splitDate: new Date().toISOString(),
      method: 'manual',
      groupCount: groupCount,
      questionsPerGroup: questionsPerGroup,
      questionRange: `${partRange.start}-${partRange.end}`,
      segments: outputFiles.map(f => ({
        group: f.group,
        questionRange: f.questionRange,
        firstQuestion: f.firstQuestion,
        lastQuestion: f.lastQuestion,
        filename: f.filename,
        path: `/part${partNumber}/${f.filename}`,
        start: parseFloat(f.start),
        end: parseFloat(f.end)
      }))
    };
    audioMetadata.addPartSegment(partNumber, metadataEntry);

    // Clean up uploaded file
    fs.unlinkSync(inputFile);

    res.json({
      success: true,
      message: `Part ${partNumber} audio split successfully (${groupCount} groups)`,
      files: outputFiles,
      timestamps: timestampsArray.map(t => ({ start: t.start.toFixed(2), end: t.end.toFixed(2) }))
    });

  } catch (error) {
    console.error(`Error manually splitting Part ${partNumber}:`, error);
    res.status(500).json({ error: error.message || `Failed to manually split Part ${partNumber}` });
  }
}

// Manual split endpoints
app.post('/api/split-part1', upload.single('audio'), (req, res) => manualSplitPart(req, res, 1, 6));
app.post('/api/split-part2', upload.single('audio'), (req, res) => manualSplitPart(req, res, 2, 25));
app.post('/api/split-part3', upload.single('audio'), (req, res) => manualSplitPartWithGroups(req, res, 3, 13, 3));
app.post('/api/split-part4', upload.single('audio'), (req, res) => manualSplitPartWithGroups(req, res, 4, 10, 3));

// Get audio duration
app.post('/api/audio-duration', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  ffmpeg.ffprobe(req.file.path, (err, metadata) => {
    if (err) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'Failed to get audio duration' });
    }

    const duration = metadata.format.duration;

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ duration: duration });
  });
});

// Detect silence in audio using FFmpeg
function detectSilence(inputFile, minSilenceDuration = 0.3) {
  return new Promise((resolve, reject) => {
    const silenceDetections = [];
    // IMPROVED: Lower threshold from -50dB to -40dB for better detection
    // TOEIC audio may have background noise, so -50dB is too strict
    const silenceThreshold = '-40dB';

    console.log(`[DEBUG] Detecting silence with threshold=${silenceThreshold}, minDuration=${minSilenceDuration}s`);

    ffmpeg(inputFile)
      .audioFilters(`silencedetect=noise=${silenceThreshold}:d=${minSilenceDuration}`)
      .format('null')
      .on('stderr', (stderrLine) => {
        // Parse silence detection output
        const silenceStartMatch = stderrLine.match(/silence_start: ([\d.]+)/);
        const silenceEndMatch = stderrLine.match(/silence_end: ([\d.]+)/);

        if (silenceStartMatch) {
          silenceDetections.push({
            type: 'start',
            time: parseFloat(silenceStartMatch[1])
          });
        }
        if (silenceEndMatch) {
          silenceDetections.push({
            type: 'end',
            time: parseFloat(silenceEndMatch[1])
          });
        }
      })
      .on('end', () => {
        console.log(`[DEBUG] Silence detection complete: found ${silenceDetections.length} silence events`);
        resolve(silenceDetections);
      })
      .on('error', (err) => {
        reject(err);
      })
      .save('/dev/null'); // Output to null (we only need stderr)
  });
}

// Helper function to split audio into groups (for Part 3 and Part 4)
// Each group contains: conversation/talk audio + 3 questions
async function splitAudioSegmentsForGroups(inputFile, timestamps, outputDir, originalName, partNumber, startQuestionNumber, questionsPerGroup) {
  const outputFiles = [];
  const promises = [];

  // Get TOEIC question range for this part
  const partRange = TOEIC_QUESTION_RANGES[partNumber];
  const expectedGroupCount = partRange.groupCount; // 13 for Part 3, 10 for Part 4

  // Determine if we need to skip direction
  let startIndex = 0;

  // If we have more groups than expected, skip the first one (likely direction)
  if (timestamps.length > expectedGroupCount) {
    console.log(`Skipping first segment (direction) - have ${timestamps.length} groups, need ${expectedGroupCount}`);
    startIndex = 1;
  } else if (timestamps.length === expectedGroupCount + 1) {
    // If we have exactly expectedGroupCount + 1, check if first segment is significantly longer
    const segmentDurations = timestamps.map(t => t.end - t.start);
    const avgDuration = segmentDurations.slice(1).reduce((a, b) => a + b, 0) / (segmentDurations.length - 1);

    // Skip first segment if it's 1.5x longer than average of remaining segments
    if (segmentDurations[0] > avgDuration * 1.5) {
      console.log(`Skipping direction segment (${segmentDurations[0].toFixed(2)}s vs avg ${avgDuration.toFixed(2)}s)`);
      startIndex = 1;
    }
  }

  for (let i = startIndex; i < timestamps.length; i++) {
    const { start, end } = timestamps[i];
    const segmentDuration = end - start;

    if (segmentDuration <= 0) continue;

    // Calculate question range for this group
    const groupIndex = i - startIndex;
    const firstQuestion = startQuestionNumber + (groupIndex * questionsPerGroup);
    const lastQuestion = firstQuestion + questionsPerGroup - 1;

    // File name format: q32-34.mp3
    const outputFileName = `${originalName}_q${firstQuestion}-${lastQuestion}.mp3`;
    const outputPath = path.join(outputDir, outputFileName);

    const promise = new Promise((resolve, reject) => {
      // Validate timestamps
      if (isNaN(start) || isNaN(segmentDuration) || start < 0 || segmentDuration <= 0) {
        const error = new Error(`Invalid timestamps for group ${groupIndex + 1}: start=${start}, duration=${segmentDuration}`);
        console.error(error.message);
        return reject(error);
      }

      let stderrOutput = '';
      ffmpeg(inputFile)
        .seekInput(start)
        .duration(segmentDuration)
        .outputOptions([
          '-map', '0:a',  // Explicitly map audio stream
          '-avoid_negative_ts', 'make_zero',
          '-acodec', 'libmp3lame',
          '-b:a', '128k',
          '-af', 'aresample=44100',
          '-f', 'mp3'
        ])
        .output(outputPath)
        .on('stderr', (stderrLine) => {
          stderrOutput += stderrLine + '\n';
        })
        .on('end', () => {
          console.log(`Group ${groupIndex + 1} (Questions ${firstQuestion}-${lastQuestion}) saved: ${outputFileName} (${start.toFixed(2)}s - ${end.toFixed(2)}s)`);
          outputFiles.push({
            group: groupIndex + 1,
            questionRange: `${firstQuestion}-${lastQuestion}`,
            firstQuestion: firstQuestion,
            lastQuestion: lastQuestion,
            filename: outputFileName,
            url: `/part${partNumber}/${outputFileName}`,
            start: start.toFixed(2),
            end: end.toFixed(2)
          });
          resolve();
        })
        .on('error', (err) => {
          console.error(`Error processing group ${groupIndex + 1} (Questions ${firstQuestion}-${lastQuestion}):`, err);
          console.error(`Start: ${start}, Duration: ${segmentDuration}, End: ${end}`);
          console.error(`FFmpeg stderr: ${stderrOutput}`);
          reject(err);
        })
        .run();
    });

    promises.push(promise);
  }

  await Promise.all(promises);

  // Validate number of groups
  if (outputFiles.length !== expectedGroupCount) {
    console.warn(`Warning: Expected ${expectedGroupCount} groups but got ${outputFiles.length}`);
  }

  // Sort outputFiles by first question number
  outputFiles.sort((a, b) => a.firstQuestion - b.firstQuestion);

  return outputFiles;
}

// Helper function to split audio into segments (for Part 1 and Part 2)
async function splitAudioSegments(inputFile, timestamps, outputDir, originalName, partNumber, questionPrefix = 'q', startQuestionNumber = null) {
  const outputFiles = [];
  const promises = [];

  // Get TOEIC question range for this part
  const partRange = TOEIC_QUESTION_RANGES[partNumber];
  const actualStartQuestion = startQuestionNumber || partRange.start;
  const expectedCount = partRange.count;

  // Determine if we need to skip direction
  let startIndex = 0;

  // If we have more segments than expected, skip the first one (likely direction)
  if (timestamps.length > expectedCount) {
    console.log(`Skipping first segment (direction) - have ${timestamps.length} segments, need ${expectedCount}`);
    startIndex = 1;
  } else if (timestamps.length === expectedCount + 1) {
    // If we have exactly expectedCount + 1, check if first segment is significantly longer
    const segmentDurations = timestamps.map(t => t.end - t.start);
    const avgDuration = segmentDurations.slice(1).reduce((a, b) => a + b, 0) / (segmentDurations.length - 1);

    // Skip first segment if it's 1.5x longer than average of remaining segments
    if (segmentDurations[0] > avgDuration * 1.5) {
      console.log(`Skipping direction segment (${segmentDurations[0].toFixed(2)}s vs avg ${avgDuration.toFixed(2)}s)`);
      startIndex = 1;
    }
  }

  for (let i = startIndex; i < timestamps.length; i++) {
    const { start, end } = timestamps[i];
    const segmentDuration = end - start;

    if (segmentDuration <= 0) continue;

    // Calculate actual question number based on TOEIC format
    const questionNumber = actualStartQuestion + (i - startIndex);
    const outputFileName = `${originalName}_${questionPrefix}${questionNumber}.mp3`;
    const outputPath = path.join(outputDir, outputFileName);

    const promise = new Promise((resolve, reject) => {
      // Validate timestamps
      if (isNaN(start) || isNaN(segmentDuration) || start < 0 || segmentDuration <= 0) {
        const error = new Error(`Invalid timestamps for question ${questionNumber}: start=${start}, duration=${segmentDuration}`);
        console.error(error.message);
        return reject(error);
      }

      let stderrOutput = '';
      ffmpeg(inputFile)
        .seekInput(start)
        .duration(segmentDuration)
        .outputOptions([
          '-map', '0:a',
          '-avoid_negative_ts', 'make_zero',
          '-acodec', 'libmp3lame',
          '-b:a', '128k',
          '-af', 'aresample=44100',
          '-f', 'mp3'
        ])
        .output(outputPath)
        .on('stderr', (stderrLine) => {
          stderrOutput += stderrLine + '\n';
        })
        .on('end', () => {
          console.log(`Question ${questionNumber} saved: ${outputFileName} (${start.toFixed(2)}s - ${end.toFixed(2)}s)`);
          outputFiles.push({
            question: questionNumber,
            filename: outputFileName,
            url: `/part${partNumber}/${outputFileName}`,
            start: start.toFixed(2),
            end: end.toFixed(2)
          });
          resolve();
        })
        .on('error', (err) => {
          console.error(`Error processing question ${questionNumber}:`, err);
          console.error(`Start: ${start}, Duration: ${segmentDuration}, End: ${end}`);
          console.error(`FFmpeg stderr: ${stderrOutput}`);
          reject(err);
        })
        .run();
    });

    promises.push(promise);
  }

  await Promise.all(promises);

  // Validate number of segments (expectedCount already declared above)
  if (outputFiles.length !== expectedCount) {
    console.warn(`Warning: Expected ${expectedCount} segments but got ${outputFiles.length}`);
  }

  // Sort outputFiles by question number to ensure correct order
  outputFiles.sort((a, b) => a.question - b.question);

  return outputFiles;
}

// Helper function to auto-detect cut points
function detectCutPoints(silenceDetections, duration, expectedCount) {
  const silencePoints = silenceDetections
    .filter(d => d.type === 'end')
    .map(d => d.time)
    .sort((a, b) => a - b);

  let cutPoints = [];

  if (silencePoints.length >= expectedCount - 1) {
    // Calculate silence durations
    const silenceDurations = [];
    for (let i = 0; i < silencePoints.length; i++) {
      const start = i > 0 ? silencePoints[i - 1] : 0;
      const end = silencePoints[i];
      const duration = end - start;
      silenceDurations.push({ start, end, duration });
    }

    // Sort by duration and take top (expectedCount - 1)
    silenceDurations.sort((a, b) => b.duration - a.duration);
    cutPoints = silenceDurations.slice(0, expectedCount - 1)
      .map(s => s.end)
      .sort((a, b) => a - b);
  } else {
    // Divide audio evenly
    const segmentDuration = duration / expectedCount;
    for (let i = 1; i < expectedCount; i++) {
      cutPoints.push(segmentDuration * i);
    }
  }

  // Create timestamps
  const timestamps = [];
  let lastEnd = 0;

  for (let i = 0; i < expectedCount; i++) {
    const start = Math.max(lastEnd, 0); // Ensure start >= 0
    const end = Math.min(i < cutPoints.length ? cutPoints[i] : duration, duration); // Ensure end <= duration
    timestamps.push({ start, end });
    lastEnd = end;
  }

  return { timestamps, method: silencePoints.length >= expectedCount - 1 ? 'silence-detection' : 'even-division' };
}

// Helper function for Part 3 and Part 4 (grouped by conversations/talks)
function detectCutPointsForGroups(silenceDetections, duration, groupCount, questionsPerGroup) {
  console.log(`[DEBUG] detectCutPointsForGroups (ENHANCED): duration=${duration.toFixed(2)}s, groupCount=${groupCount}`);

  // 1. Build list of silence periods
  const silenceStarts = silenceDetections
    .filter(d => d.type === 'start')
    .map(d => d.time)
    .sort((a, b) => a - b);

  const silenceEnds = silenceDetections
    .filter(d => d.type === 'end')
    .map(d => d.time)
    .sort((a, b) => a - b);

  const silencePeriods = [];
  for (let i = 0; i < silenceStarts.length; i++) {
    const start = silenceStarts[i];
    const end = silenceEnds.find(e => e > start);
    if (end) {
      silencePeriods.push({ start, end, duration: end - start });
    }
  }

  // 2. Identification of Introduction/Direction
  // Usually the first long silence (~30-60s in) represents the end of directions
  const directionMaxEnd = duration * 0.25; // Direction usually ends within first 25%
  const longSilences = silencePeriods.filter(sp => sp.duration > 0.8).sort((a, b) => a.start - b.start);

  let directionEnd = 0;
  const firstLongSilence = longSilences.find(sp => sp.end > 20 && sp.end < directionMaxEnd);

  if (firstLongSilence) {
    directionEnd = firstLongSilence.end;
    console.log(`[DEBUG] Identified Direction end at ${directionEnd.toFixed(2)}s`);
  } else {
    // Fallback: estimate direction at 35s if not found
    directionEnd = Math.min(35, duration * 0.1);
    console.log(`[DEBUG] Direction not clearly found, assuming end at ${directionEnd.toFixed(2)}s`);
  }

  // 3. Scoring System for Group Boundaries
  // User says groups are ~1'10" (70s)
  const effectiveDuration = duration - directionEnd;
  const expectedInterval = effectiveDuration / groupCount;
  console.log(`[DEBUG] Effective duration: ${effectiveDuration.toFixed(2)}s, Expected interval: ${expectedInterval.toFixed(2)}s`);

  let cutPoints = [];
  let currentPos = directionEnd;
  let method = 'time-weighted-silence';

  for (let i = 1; i < groupCount; i++) {
    const expectedTime = directionEnd + (i * expectedInterval);
    const windowStart = expectedTime - 20;
    const windowEnd = expectedTime + 20;

    // Find silence candidates in this window
    const candidates = silencePeriods.filter(sp => sp.end >= windowStart && sp.end <= windowEnd);

    if (candidates.length > 0) {
      // Score = (SilenceDuration * 5) - (Distance from expected time)
      // We want long silences that are CLOSE to the expected timing
      candidates.forEach(c => {
        c.score = (c.duration * 5) - Math.abs(c.end - expectedTime);
      });

      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      cutPoints.push(best.end);
      console.log(`[DEBUG] Group ${i} boundary found at ${best.end.toFixed(2)}s (score: ${best.score.toFixed(2)}, dist: ${Math.abs(best.end - expectedTime).toFixed(2)}s)`);
    } else {
      // No silence in window, fallback to expected time
      cutPoints.push(expectedTime);
      console.log(`[DEBUG] Group ${i} no silence in window, using expected time ${expectedTime.toFixed(2)}s`);
      method = 'hybrid-timing';
    }
  }

  // Create timestamps
  const timestamps = [];
  let lastEnd = 0;
  for (let i = 0; i < groupCount; i++) {
    const end = i < cutPoints.length ? cutPoints[i] : duration;
    timestamps.push({ start: lastEnd, end: end });
    lastEnd = end;
  }

  console.log(`[DEBUG] Generated ${timestamps.length} timestamps using ${method}`);
  return { timestamps, method };
}

// Generic auto-split function for any part
async function autoSplitPart(req, res, partNumber, expectedCount) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const inputFile = req.file.path;
    const originalName = path.parse(req.file.originalname).name;
    const outputDir = path.join(__dirname, 'audio', `part${partNumber}`);

    // Validate part number and expected count
    const partRange = TOEIC_QUESTION_RANGES[partNumber];
    if (!partRange) {
      return res.status(400).json({ error: `Invalid part number: ${partNumber}` });
    }
    if (expectedCount !== partRange.count) {
      return res.status(400).json({ error: `Expected count ${expectedCount} does not match part range ${partRange.count}` });
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get audio duration
    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputFile, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration);
      });
    });

    // Detect silence
    console.log(`Detecting silence for Part ${partNumber}...`);
    const silenceDetections = await detectSilence(inputFile);

    // Detect cut points (expect one extra for direction)
    const { timestamps, method } = detectCutPoints(silenceDetections, duration, expectedCount + 1);

    // Split audio with correct question numbering
    const outputFiles = await splitAudioSegments(inputFile, timestamps, outputDir, originalName, partNumber, 'q', partRange.start);

    // Validate final count
    if (outputFiles.length !== expectedCount) {
      return res.status(400).json({
        error: `Expected ${expectedCount} questions but got ${outputFiles.length}. Please check if direction was properly skipped.`,
        files: outputFiles.length
      });
    }

    // Save metadata with correct question numbers
    const metadataEntry = {
      originalFile: req.file.originalname,
      splitDate: new Date().toISOString(),
      method: method,
      questionRange: `${partRange.start}-${partRange.end}`,
      segments: outputFiles.map(f => ({
        question: f.question,
        filename: f.filename,
        path: `/part${partNumber}/${f.filename}`,
        start: parseFloat(f.start),
        end: parseFloat(f.end)
      }))
    };
    audioMetadata.addPartSegment(partNumber, metadataEntry);

    // Clean up uploaded file
    fs.unlinkSync(inputFile);

    res.json({
      success: true,
      message: `Part ${partNumber} audio auto-split successfully`,
      method: method,
      files: outputFiles,
      timestamps: timestamps.map(t => ({ start: t.start.toFixed(2), end: t.end.toFixed(2) }))
    });

  } catch (error) {
    console.error(`Error auto-splitting Part ${partNumber}:`, error);
    res.status(500).json({ error: error.message || `Failed to auto-split Part ${partNumber}` });
  }
}

// Simplified function to split Part 3 and Part 4 into groups
// Each group: "question X to Y" + conversation/talk + 3 questions
async function splitPart3And4Groups(inputFile, outputDir, originalName, partNumber, startQuestionNumber, groupCount, questionsPerGroup, duration) {
  const outputFiles = [];
  const promises = [];

  // Validate input file exists
  if (!fs.existsSync(inputFile)) {
    const error = new Error(`Input file does not exist: ${inputFile}`);
    throw error;
  }

  // Simple even division - divide audio into groups
  const groupDuration = duration / groupCount;

  console.log(`Splitting Part ${partNumber} into ${groupCount} groups using even division`);
  console.log(`Total duration: ${duration.toFixed(2)}s, Group duration: ${groupDuration.toFixed(2)}s`);

  for (let i = 0; i < groupCount; i++) {
    // Calculate start time
    const start = i * groupDuration;

    // Calculate end time - for last group, use exact duration to avoid rounding errors
    let end;
    if (i === groupCount - 1) {
      end = duration; // Last group goes to the end
    } else {
      end = (i + 1) * groupDuration;
    }

    // Ensure values are within bounds
    const actualStart = Math.max(0, Math.min(start, duration));
    const actualEnd = Math.max(actualStart, Math.min(end, duration));
    const actualDuration = actualEnd - actualStart;

    // Validate timestamps
    if (actualDuration <= 0 || isNaN(actualStart) || isNaN(actualEnd) || isNaN(actualDuration)) {
      console.warn(`Skipping invalid group ${i + 1}: start=${actualStart}, end=${actualEnd}, duration=${actualDuration}`);
      continue;
    }

    if (actualStart >= duration) {
      console.warn(`Skipping group ${i + 1}: start (${actualStart}) >= total duration (${duration})`);
      continue;
    }

    // Calculate question range
    const firstQuestion = startQuestionNumber + (i * questionsPerGroup);
    const lastQuestion = firstQuestion + questionsPerGroup - 1;

    // File name format: q32-34.mp3
    const outputFileName = `${originalName}_q${firstQuestion}-${lastQuestion}.mp3`;
    const outputPath = path.join(outputDir, outputFileName);

    const promise = new Promise((resolve, reject) => {
      // Final validation before FFmpeg
      if (actualStart < 0 || actualStart >= duration || actualEnd > duration || actualDuration <= 0) {
        const error = new Error(`Invalid timestamps for group ${i + 1}: start=${actualStart}, end=${actualEnd}, duration=${actualDuration}, total=${duration}`);
        console.error(error.message);
        return reject(error);
      }

      // Verify file exists
      if (!fs.existsSync(inputFile)) {
        const error = new Error(`Input file does not exist: ${inputFile}`);
        console.error(error.message);
        return reject(error);
      }

      // Verify output directory exists and is writable
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      let stderrOutput = '';
      let ffmpegCommandLine = '';

      // Use seekInput for better compatibility (input seeking instead of output seeking)
      // This is more reliable for formats that don't support output seeking well
      // Use explicit audio stream mapping and let FFmpeg handle format conversion automatically
      ffmpeg(inputFile)
        .seekInput(actualStart)
        .duration(actualDuration)
        .outputOptions([
          '-map', '0:a',  // Explicitly map audio stream
          '-avoid_negative_ts', 'make_zero',
          '-acodec', 'libmp3lame',
          '-b:a', '128k',
          '-af', 'aresample=44100',  // Use audio filter for resampling
          '-f', 'mp3'
        ])
        .output(outputPath)
        .on('stderr', (stderrLine) => {
          stderrOutput += stderrLine + '\n';
        })
        .on('start', (commandLine) => {
          ffmpegCommandLine = commandLine;
          console.log(`[FFmpeg] Group ${i + 1} (Q${firstQuestion}-${lastQuestion}): start=${actualStart.toFixed(2)}s, duration=${actualDuration.toFixed(2)}s`);
        })
        .on('end', () => {
          console.log(`✓ Group ${i + 1} (Questions ${firstQuestion}-${lastQuestion}) saved: ${outputFileName}`);
          outputFiles.push({
            group: i + 1,
            questionRange: `${firstQuestion}-${lastQuestion}`,
            firstQuestion: firstQuestion,
            lastQuestion: lastQuestion,
            filename: outputFileName,
            url: `/part${partNumber}/${outputFileName}`,
            start: actualStart.toFixed(2),
            end: actualEnd.toFixed(2)
          });
          resolve();
        })
        .on('error', (err) => {
          console.error(`✗ Error processing group ${i + 1} (Questions ${firstQuestion}-${lastQuestion}):`, err.message);
          console.error(`  Start: ${actualStart}, End: ${actualEnd}, Duration: ${actualDuration}, Total: ${duration}`);
          console.error(`  Input file: ${inputFile}`);
          console.error(`  Output file: ${outputPath}`);
          if (stderrOutput) {
            console.error(`  FFmpeg stderr: ${stderrOutput.substring(0, 500)}`);
          }
          reject(err);
        })
        .run();
    });

    promises.push(promise);
  }

  try {
    await Promise.all(promises);
  } catch (error) {
    throw error;
  }

  // Sort by first question number
  outputFiles.sort((a, b) => a.firstQuestion - b.firstQuestion);

  return outputFiles;
}

// Auto-split function for Part 3 and Part 4 (split into groups: conversation/talk + 3 questions)
async function autoSplitPartWithGroups(req, res, partNumber, groupCount, questionsPerGroup) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const inputFile = req.file.path;
    const originalName = path.parse(req.file.originalname).name;
    const outputDir = path.join(__dirname, 'audio', `part${partNumber}`);

    // Validate part number
    const partRange = TOEIC_QUESTION_RANGES[partNumber];
    if (!partRange || !partRange.groupCount) {
      return res.status(400).json({ error: `Invalid part number or part does not use groups: ${partNumber}` });
    }
    if (groupCount !== partRange.groupCount || questionsPerGroup !== partRange.questionsPerGroup) {
      return res.status(400).json({ error: `Group count mismatch. Expected ${partRange.groupCount} groups with ${partRange.questionsPerGroup} questions each` });
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get audio duration
    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputFile, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration);
      });
    });

    console.log(`Splitting Part ${partNumber} (${groupCount} groups, duration: ${duration.toFixed(2)}s)...`);

    // Detect silence to find group boundaries
    console.log(`Detecting silence for Part ${partNumber}...`);
    const silenceDetections = await detectSilence(inputFile, 0.3);

    // Use improved silence detection to find group boundaries
    const { timestamps, method } = detectCutPointsForGroups(silenceDetections, duration, groupCount, questionsPerGroup);

    console.log(`Using method: ${method}`);

    // Split audio using detected timestamps
    const outputFiles = await splitAudioSegmentsForGroups(
      inputFile,
      timestamps,
      outputDir,
      originalName,
      partNumber,
      partRange.start,
      questionsPerGroup
    );

    // Validate final count
    if (outputFiles.length !== groupCount) {
      return res.status(400).json({
        error: `Expected ${groupCount} groups but got ${outputFiles.length}`,
        files: outputFiles.length
      });
    }

    // Save metadata with correct question ranges
    const metadataEntry = {
      originalFile: req.file.originalname,
      splitDate: new Date().toISOString(),
      method: method,
      groupCount: groupCount,
      questionsPerGroup: questionsPerGroup,
      questionRange: `${partRange.start}-${partRange.end}`,
      segments: outputFiles.map(f => ({
        group: f.group,
        questionRange: f.questionRange,
        firstQuestion: f.firstQuestion,
        lastQuestion: f.lastQuestion,
        filename: f.filename,
        path: `/part${partNumber}/${f.filename}`,
        start: parseFloat(f.start),
        end: parseFloat(f.end)
      }))
    };
    audioMetadata.addPartSegment(partNumber, metadataEntry);

    fs.unlinkSync(inputFile);

    res.json({
      success: true,
      message: `Part ${partNumber} audio auto-split successfully (${groupCount} groups)`,
      method: method,
      files: outputFiles,
      timestamps: timestamps.map(t => ({ start: t.start.toFixed(2), end: t.end.toFixed(2) }))
    });

  } catch (error) {
    console.error(`Error auto-splitting Part ${partNumber}:`, error);
    res.status(500).json({ error: error.message || `Failed to auto-split Part ${partNumber}` });
  }
}

// Auto-split endpoints for each part
app.post('/api/auto-split-part1', upload.single('audio'), (req, res) => autoSplitPart(req, res, 1, 6));
app.post('/api/auto-split-part2', upload.single('audio'), (req, res) => autoSplitPart(req, res, 2, 25));
app.post('/api/auto-split-part3', upload.single('audio'), (req, res) => autoSplitPartWithGroups(req, res, 3, 13, 3)); // 13 conversations, 3 questions each
app.post('/api/auto-split-part4', upload.single('audio'), (req, res) => autoSplitPartWithGroups(req, res, 4, 10, 3)); // 10 talks, 3 questions each

// Split full LC audio into all parts
app.post('/api/split-full-lc', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const inputFile = req.file.path;
    const originalName = path.parse(req.file.originalname).name;

    // Get audio duration
    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputFile, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration);
      });
    });

    // Detect silence to find part boundaries
    console.log('Detecting silence in full LC audio...');
    const silenceDetections = await detectSilence(inputFile);

    // Find major silence points (likely between parts)
    const silencePoints = silenceDetections
      .filter(d => d.type === 'end')
      .map(d => d.time)
      .sort((a, b) => a - b);

    // Estimate part boundaries (typical TOEIC LC structure)
    // Part 1: ~2-3 min, Part 2: ~5-7 min, Part 3: ~10-12 min, Part 4: ~8-10 min
    // We'll use silence detection or estimate based on duration
    let partBoundaries = [];

    if (silencePoints.length >= 3) {
      // Use longest silences as part boundaries
      const silenceDurations = [];
      for (let i = 0; i < silencePoints.length; i++) {
        const start = i > 0 ? silencePoints[i - 1] : 0;
        const end = silencePoints[i];
        const dur = end - start;
        silenceDurations.push({ start, end, duration: dur });
      }
      silenceDurations.sort((a, b) => b.duration - a.duration);
      partBoundaries = silenceDurations.slice(0, 3).map(s => s.end).sort((a, b) => a - b);
    } else {
      // Estimate: Part 1: 15%, Part 2: 25%, Part 3: 35%, Part 4: 25%
      partBoundaries = [
        duration * 0.15,
        duration * 0.40,
        duration * 0.75
      ];
    }

    // Define part configurations based on TOEIC format:
    // Part 1: 6 questions (individual)
    // Part 2: 25 questions (individual)
    // Part 3: 13 conversations (each has 3 questions) = 13 groups
    // Part 4: 10 talks (each has 3 questions) = 10 groups
    const partConfigs = [
      { number: 1, start: 0, end: partBoundaries[0] || duration * 0.15, count: 6, isGrouped: false },
      { number: 2, start: partBoundaries[0] || duration * 0.15, end: partBoundaries[1] || duration * 0.40, count: 25, isGrouped: false },
      { number: 3, start: partBoundaries[1] || duration * 0.40, end: partBoundaries[2] || duration * 0.75, groupCount: 13, questionsPerGroup: 3, isGrouped: true },
      { number: 4, start: partBoundaries[2] || duration * 0.75, end: duration, groupCount: 10, questionsPerGroup: 3, isGrouped: true }
    ];

    const allResults = {};

    // Process each part
    for (const partConfig of partConfigs) {
      const { number, start, end, isGrouped } = partConfig;
      const partDuration = end - start;
      const outputDir = path.join(__dirname, 'audio', `part${number}`);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Create temporary file for this part
      const tempPartFile = path.join(__dirname, 'uploads', `temp_part${number}_${Date.now()}.mp3`);

      // Extract part from full audio
      await new Promise((resolve, reject) => {
        // Validate part boundaries
        if (isNaN(start) || isNaN(partDuration) || start < 0 || partDuration <= 0 || start + partDuration > duration) {
          const error = new Error(`Invalid part boundaries for Part ${number}: start=${start}, duration=${partDuration}, total=${duration}`);
          console.error(error.message);
          return reject(error);
        }

        let stderrOutput = '';
        ffmpeg(inputFile)
          .setStartTime(start)
          .setDuration(partDuration)
          .output(tempPartFile)
          .on('stderr', (stderrLine) => {
            stderrOutput += stderrLine + '\n';
          })
          .on('end', resolve)
          .on('error', (err) => {
            console.error(`Error extracting Part ${number}:`, err);
            console.error(`Start: ${start}, Duration: ${partDuration}, End: ${start + partDuration}`);
            console.error(`FFmpeg stderr: ${stderrOutput}`);
            reject(err);
          })
          .run();
      });

      // Detect silence in this part
      const partSilenceDetections = await detectSilence(tempPartFile);

      // Get part range for correct question numbering
      const partRange = TOEIC_QUESTION_RANGES[number];

      let timestamps, method;
      let outputFiles;

      if (isGrouped) {
        // Part 3 or Part 4: split by groups (conversation/talk + 3 questions)
        // Use improved silence detection
        const { groupCount, questionsPerGroup } = partConfig;

        // Use silence detection to find group boundaries
        const result = detectCutPointsForGroups(partSilenceDetections, partDuration, groupCount, questionsPerGroup);
        timestamps = result.timestamps;
        method = result.method;

        // Split into groups using detected timestamps
        outputFiles = await splitAudioSegmentsForGroups(
          tempPartFile,
          timestamps,
          outputDir,
          `${originalName}_part${number}`,
          number,
          partRange.start,
          questionsPerGroup
        );

        // Validate final count
        if (outputFiles.length !== groupCount) {
          console.warn(`Part ${number}: Expected ${groupCount} groups but got ${outputFiles.length}`);
        }
      } else {
        // Part 1 or Part 2: split by individual questions
        const { count } = partConfig;
        // Expect one extra segment for direction
        const result = detectCutPoints(partSilenceDetections, partDuration, count + 1);
        timestamps = result.timestamps;
        method = result.method;

        // Split into individual questions
        outputFiles = await splitAudioSegments(
          tempPartFile,
          timestamps,
          outputDir,
          `${originalName}_part${number}`,
          number,
          'q',
          partRange.start
        );

        // Validate final count
        if (outputFiles.length !== count) {
          console.warn(`Part ${number}: Expected ${count} questions but got ${outputFiles.length}`);
        }
      }

      // Save metadata with correct question numbers/ranges
      const metadataEntry = {
        originalFile: req.file.originalname,
        splitDate: new Date().toISOString(),
        method: method,
        partStart: start,
        partEnd: end,
        isGrouped: isGrouped,
        questionRange: `${partRange.start}-${partRange.end}`,
        ...(isGrouped && {
          groupCount: partConfig.groupCount,
          questionsPerGroup: partConfig.questionsPerGroup
        }),
        segments: outputFiles.map(f => {
          if (isGrouped) {
            return {
              group: f.group,
              questionRange: f.questionRange,
              firstQuestion: f.firstQuestion,
              lastQuestion: f.lastQuestion,
              filename: f.filename,
              path: `/part${number}/${f.filename}`,
              start: parseFloat(f.start) + start, // Absolute time in full LC
              end: parseFloat(f.end) + start
            };
          } else {
            return {
              question: f.question,
              filename: f.filename,
              path: `/part${number}/${f.filename}`,
              start: parseFloat(f.start) + start, // Absolute time in full LC
              end: parseFloat(f.end) + start
            };
          }
        })
      };
      audioMetadata.addPartSegment(number, metadataEntry);

      // Clean up temp file
      fs.unlinkSync(tempPartFile);

      // Sort files by question/group number before adding to results
      const sortedOutputFiles = [...outputFiles].sort((a, b) => {
        if (isGrouped) {
          return a.firstQuestion - b.firstQuestion;
        } else {
          return a.question - b.question;
        }
      });

      allResults[`part${number}`] = {
        files: sortedOutputFiles,
        timestamps: timestamps.map(t => ({
          start: (t.start + start).toFixed(2),
          end: (t.end + start).toFixed(2)
        })),
        method: method
      };
    }

    // Save full LC metadata
    const fullLCMetadata = {
      originalFile: req.file.originalname,
      splitDate: new Date().toISOString(),
      totalDuration: duration,
      parts: partConfigs.map(p => ({
        part: p.number,
        start: p.start,
        end: p.end,
        isGrouped: p.isGrouped,
        ...(p.isGrouped ? {
          groupCount: p.groupCount,
          questionsPerGroup: p.questionsPerGroup,
          totalSegments: p.groupCount
        } : {
          segmentCount: p.count
        })
      })),
      partBoundaries: partBoundaries.map(b => b.toFixed(2))
    };
    audioMetadata.addFullLCEntry(fullLCMetadata);

    // Clean up uploaded file
    fs.unlinkSync(inputFile);

    res.json({
      success: true,
      message: 'Full LC audio split successfully',
      results: allResults,
      metadata: fullLCMetadata
    });

  } catch (error) {
    console.error('Error splitting full LC audio:', error);
    // Ensure we always return JSON, even on error
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Failed to split full LC audio' });
    }
  }
});

// Error handling middleware - must be after all routes
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Get metadata
app.get('/api/metadata', (req, res) => {
  try {
    const metadata = audioMetadata.getAllMetadata();
    res.json(metadata);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load metadata' });
  }
});

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Place your audio files in the "audio" folder');
  console.log('Supported formats: .mp3, .wav, .m4a, .ogg, .aac, .flac');
  console.log('\n⚠️  Make sure FFmpeg is installed: brew install ffmpeg');
});
