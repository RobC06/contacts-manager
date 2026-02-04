#!/usr/bin/env node
// Generates bright blue PNG icon files for the Task Manager extension.
// Run: node generate-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crcValue = crc32(crcInput);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crcValue, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function createPNG(size) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.45;
  const bgR = 37, bgG = 99, bgB = 235;         // #2563EB - bright blue
  const checkR = 255, checkG = 255, checkB = 255; // white checkmark

  const rawData = Buffer.alloc(size * (1 + size * 4));

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 4);
    rawData[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Inside circle - blue background
        // Draw checkmark
        const nx = (x - cx) / radius;
        const ny = (y - cy) / radius;

        const thick = Math.max(1.5, size * 0.09);

        // Checkmark: short leg from (-0.3, 0.05) to (-0.05, 0.35)
        // Long leg from (-0.05, 0.35) to (0.4, -0.3)
        const s1x = -0.3, s1y = 0.05, e1x = -0.05, e1y = 0.35;
        const s2x = -0.05, s2y = 0.35, e2x = 0.4, e2y = -0.3;

        function distToSegment(px, py, ax, ay, bx, by) {
          const abx = bx - ax, aby = by - ay;
          const apx = px - ax, apy = py - ay;
          let t = (apx * abx + apy * aby) / (abx * abx + aby * aby);
          t = Math.max(0, Math.min(1, t));
          const cx = ax + t * abx, cy = ay + t * aby;
          return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
        }

        const d1 = distToSegment(nx, ny, s1x, s1y, e1x, e1y);
        const d2 = distToSegment(nx, ny, s2x, s2y, e2x, e2y);
        const checkDist = Math.min(d1, d2);
        const checkThreshold = thick / radius;

        if (checkDist < checkThreshold) {
          rawData[px] = checkR;
          rawData[px + 1] = checkG;
          rawData[px + 2] = checkB;
          rawData[px + 3] = 255;
        } else {
          rawData[px] = bgR;
          rawData[px + 1] = bgG;
          rawData[px + 2] = bgB;
          rawData[px + 3] = 255;
        }
      } else if (dist <= radius + 1.5) {
        const alpha = Math.max(0, Math.min(255, Math.round((radius + 1.5 - dist) * 170)));
        rawData[px] = bgR;
        rawData[px + 1] = bgG;
        rawData[px + 2] = bgB;
        rawData[px + 3] = alpha;
      } else {
        rawData[px] = 0;
        rawData[px + 1] = 0;
        rawData[px + 2] = 0;
        rawData[px + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [16, 48, 128];
sizes.forEach(size => {
  const png = createPNG(size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created ${filePath} (${png.length} bytes)`);
});

console.log('Blue task manager icons generated successfully.');
