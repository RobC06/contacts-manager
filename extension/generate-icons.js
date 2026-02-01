#!/usr/bin/env node
// Generates PNG icon files for the Time Tracker browser extension.
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
  const radius = size * 0.42;
  const bgR = 73, bgG = 80, bgB = 87;       // #495057 - header color
  const faceR = 255, faceG = 255, faceB = 255; // white clock face
  const handR = 73, handG = 80, handB = 87;    // dark hands

  // Build raw pixel data (filter byte + RGBA per pixel per row)
  const rawData = Buffer.alloc(size * (1 + size * 4));

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 4);
    rawData[rowOffset] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Inside circle - white clock face
        const edgeDist = radius - dist;
        if (edgeDist < 1.5) {
          // Border ring
          rawData[px] = bgR;
          rawData[px + 1] = bgG;
          rawData[px + 2] = bgB;
          rawData[px + 3] = 255;
        } else {
          // Check if this pixel is on a clock hand
          const hourHandLen = radius * 0.45;
          const minuteHandLen = radius * 0.65;
          const hourAngle = -Math.PI / 6;   // 10 o'clock position
          const minuteAngle = Math.PI / 6;  // 2 o'clock position (pointing to 10 min)

          // Hour hand (thicker)
          const hx = Math.sin(hourAngle);
          const hy = -Math.cos(hourAngle);
          const hProj = dx * hx + dy * hy;
          const hPerp = Math.abs(dx * hy - dy * hx);
          const handThick = Math.max(1.5, size * 0.08);

          // Minute hand (thinner)
          const mx = Math.sin(minuteAngle);
          const my = -Math.cos(minuteAngle);
          const mProj = dx * mx + dy * my;
          const mPerp = Math.abs(dx * my - dy * mx);
          const minThick = Math.max(1, size * 0.05);

          // Center dot
          const centerDist = Math.sqrt(dx * dx + dy * dy);

          if ((hProj > 0 && hProj < hourHandLen && hPerp < handThick) ||
              (mProj > 0 && mProj < minuteHandLen && mPerp < minThick) ||
              centerDist < size * 0.06) {
            // Clock hand pixel
            rawData[px] = handR;
            rawData[px + 1] = handG;
            rawData[px + 2] = handB;
            rawData[px + 3] = 255;
          } else {
            // White face
            rawData[px] = faceR;
            rawData[px + 1] = faceG;
            rawData[px + 2] = faceB;
            rawData[px + 3] = 255;
          }
        }
      } else if (dist <= radius + 1.5) {
        // Anti-aliased edge
        const alpha = Math.max(0, Math.min(255, Math.round((radius + 1.5 - dist) * 170)));
        rawData[px] = bgR;
        rawData[px + 1] = bgG;
        rawData[px + 2] = bgB;
        rawData[px + 3] = alpha;
      } else {
        // Transparent background
        rawData[px] = 0;
        rawData[px + 1] = 0;
        rawData[px + 2] = 0;
        rawData[px + 3] = 0;
      }
    }
  }

  // Compress with zlib
  const compressed = zlib.deflateSync(rawData);

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate icons
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

console.log('Icons generated successfully.');
