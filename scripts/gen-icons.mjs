#!/usr/bin/env node
// Generates solid-color PNG placeholders for the extension icons.
// Replace public/icons/*.png with real artwork before publishing to CWS.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';

const SIZE_LIST = [16, 32, 48, 128];
const ICON_DIR = 'public/icons';
const COLOR = [99, 102, 241, 255]; // indigo, opaque

function crc32(buf) {
  let c;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const row = Buffer.alloc(1 + size * 4);
  for (let x = 0; x < size; x++) {
    row[1 + x * 4] = COLOR[0];
    row[1 + x * 4 + 1] = COLOR[1];
    row[1 + x * 4 + 2] = COLOR[2];
    row[1 + x * 4 + 3] = COLOR[3];
  }
  const raw = Buffer.alloc((1 + size * 4) * size);
  for (let y = 0; y < size; y++) row.copy(raw, y * (1 + size * 4));
  const idat = deflateSync(raw);

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(dirname(`${ICON_DIR}/x`), { recursive: true });
for (const size of SIZE_LIST) {
  const path = `${ICON_DIR}/${size}.png`;
  writeFileSync(path, makePng(size));
  console.log(`wrote ${path}`);
}
