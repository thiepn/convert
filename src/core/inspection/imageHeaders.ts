import type { ImageInspectionDetails, ImageMetadataSummary } from "../image/types";

const emptyMetadata = (): ImageMetadataSummary => ({
  exif: false,
  xmp: false,
  iptc: false,
  icc: false,
  gps: false
});

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function u16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function parseTiff(bytes: Uint8Array, base = 0): ImageInspectionDetails | undefined {
  if (base + 8 > bytes.length) return undefined;
  const order = ascii(bytes, base, 2);
  const little = order === "II";
  if (!little && order !== "MM") return undefined;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read16 = (offset: number) => {
    if (offset < 0 || offset + 2 > bytes.length) throw new RangeError();
    return view.getUint16(offset, little);
  };
  const read32 = (offset: number) => {
    if (offset < 0 || offset + 4 > bytes.length) throw new RangeError();
    return view.getUint32(offset, little);
  };

  try {
    if (read16(base + 2) !== 42) return undefined;
    let relativeIfd = read32(base + 4);
    let width: number | undefined;
    let height: number | undefined;
    let bitDepth: number | undefined;
    let orientation: number | undefined;
    let samplesPerPixel: number | undefined;
    let alpha = false;
    let pages = 0;
    const metadata = emptyMetadata();
    const seen = new Set<number>();

    const valueOf = (entry: number, type: number, count: number): number | undefined => {
      const typeSize = type === 3 ? 2 : type === 4 ? 4 : 1;
      const total = typeSize * count;
      const valueOffset = total <= 4 ? entry + 8 : base + read32(entry + 8);
      if (type === 3) return read16(valueOffset);
      if (type === 4) return read32(valueOffset);
      return bytes[valueOffset];
    };

    while (relativeIfd && pages < 2048) {
      const ifd = base + relativeIfd;
      if (seen.has(ifd) || ifd + 2 > bytes.length) break;
      seen.add(ifd);
      pages += 1;

      const count = read16(ifd);
      const entriesStart = ifd + 2;
      if (entriesStart + count * 12 + 4 > bytes.length) break;

      for (let index = 0; index < count; index += 1) {
        const entry = entriesStart + index * 12;
        const tag = read16(entry);
        const type = read16(entry + 2);
        const valueCount = read32(entry + 4);
        const value = valueOf(entry, type, valueCount);

        if (pages === 1) {
          if (tag === 256) width = value;
          if (tag === 257) height = value;
          if (tag === 258) bitDepth = value;
          if (tag === 274) orientation = value;
          if (tag === 277) samplesPerPixel = value;
          if (tag === 338 && value !== undefined) alpha = true;
          if (tag === 34665) metadata.exif = true;
          if (tag === 34853) metadata.gps = true;
          if (tag === 34675) metadata.icc = true;
          if (tag === 700) metadata.xmp = true;
          if (tag === 33723) metadata.iptc = true;
        }
      }

      relativeIfd = read32(entriesStart + count * 12);
    }

    if ((samplesPerPixel ?? 0) >= 4) alpha = true;

    return {
      width,
      height,
      bitDepth,
      orientation,
      alpha,
      animated: false,
      multiplePages: pages > 1,
      frameCount: pages || undefined,
      metadata
    };
  } catch {
    return undefined;
  }
}

function parseJpeg(bytes: Uint8Array): ImageInspectionDetails | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  const metadata = emptyMetadata();
  let width: number | undefined;
  let height: number | undefined;
  let bitDepth: number | undefined;
  let orientation: number | undefined;
  let offset = 2;
  const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;

    const length = u16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    const payload = offset + 2;
    const payloadLength = length - 2;

    if (sof.has(marker) && payloadLength >= 6) {
      bitDepth = bytes[payload];
      height = u16be(bytes, payload + 1);
      width = u16be(bytes, payload + 3);
    }

    if (marker === 0xe1 && payloadLength >= 6) {
      const prefix = ascii(bytes, payload, Math.min(payloadLength, 32));
      if (prefix.startsWith("Exif\0\0")) {
        metadata.exif = true;
        const tiff = parseTiff(bytes, payload + 6);
        orientation = tiff?.orientation ?? orientation;
        metadata.gps = metadata.gps || Boolean(tiff?.metadata.gps);
      } else if (prefix.startsWith("http://ns.adobe.com/xap/1.0/")) {
        metadata.xmp = true;
      }
    }

    if (marker === 0xe2 && ascii(bytes, payload, Math.min(payloadLength, 12)).startsWith("ICC_PROFILE")) {
      metadata.icc = true;
    }

    if (marker === 0xed) metadata.iptc = true;
    offset += length;
  }

  return {
    width,
    height,
    bitDepth,
    orientation,
    alpha: false,
    animated: false,
    multiplePages: false,
    frameCount: 1,
    metadata
  };
}

function parsePng(bytes: Uint8Array): ImageInspectionDetails | undefined {
  if (bytes.length < 24 || ascii(bytes, 1, 3) !== "PNG") return undefined;
  const metadata = emptyMetadata();
  let width: number | undefined;
  let height: number | undefined;
  let bitDepth: number | undefined;
  let alpha = false;
  let frameCount = 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const data = offset + 8;
    if (data + length + 4 > bytes.length) break;

    if (type === "IHDR" && length >= 13) {
      width = view.getUint32(data);
      height = view.getUint32(data + 4);
      bitDepth = bytes[data + 8];
      const colorType = bytes[data + 9];
      alpha = colorType === 4 || colorType === 6;
    } else if (type === "acTL" && length >= 8) {
      frameCount = view.getUint32(data);
    } else if (type === "iCCP") {
      metadata.icc = true;
    } else if (type === "eXIf") {
      metadata.exif = true;
      const tiff = parseTiff(bytes, data);
      metadata.gps = metadata.gps || Boolean(tiff?.metadata.gps);
    } else if (type === "tRNS") {
      alpha = true;
    } else if (type === "iTXt" || type === "tEXt") {
      const text = ascii(bytes, data, Math.min(length, 256));
      if (/xmp|XML:com\.adobe\.xmp/i.test(text)) metadata.xmp = true;
    }

    offset = data + length + 4;
    if (type === "IEND") break;
  }

  return {
    width,
    height,
    bitDepth,
    alpha,
    animated: frameCount > 1,
    multiplePages: false,
    frameCount,
    metadata
  };
}

function parseWebp(bytes: Uint8Array): ImageInspectionDetails | undefined {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return undefined;
  const metadata = emptyMetadata();
  let width: number | undefined;
  let height: number | undefined;
  let alpha = false;
  let animated = false;
  let frameCount = 0;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = (bytes[offset + 4] ?? 0)
      | ((bytes[offset + 5] ?? 0) << 8)
      | ((bytes[offset + 6] ?? 0) << 16)
      | ((bytes[offset + 7] ?? 0) << 24);
    const data = offset + 8;
    if (data + size > bytes.length) break;

    if (type === "VP8X" && size >= 10) {
      const flags = bytes[data];
      metadata.icc = Boolean(flags & 0x20);
      alpha = Boolean(flags & 0x10);
      metadata.exif = Boolean(flags & 0x08);
      metadata.xmp = Boolean(flags & 0x04);
      animated = Boolean(flags & 0x02);
      width = 1 + u24le(bytes, data + 4);
      height = 1 + u24le(bytes, data + 7);
    } else if (type === "VP8 " && size >= 10 && width === undefined) {
      width = 1 + ((bytes[data + 6] ?? 0) | (((bytes[data + 7] ?? 0) & 0x3f) << 8)) - 1;
      height = 1 + ((bytes[data + 8] ?? 0) | (((bytes[data + 9] ?? 0) & 0x3f) << 8)) - 1;
    } else if (type === "VP8L" && size >= 5 && bytes[data] === 0x2f && width === undefined) {
      const b1 = bytes[data + 1] ?? 0;
      const b2 = bytes[data + 2] ?? 0;
      const b3 = bytes[data + 3] ?? 0;
      const b4 = bytes[data + 4] ?? 0;
      width = 1 + (b1 | ((b2 & 0x3f) << 8));
      height = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
    } else if (type === "ANMF") {
      frameCount += 1;
      animated = true;
    } else if (type === "ICCP") {
      metadata.icc = true;
    } else if (type === "EXIF") {
      metadata.exif = true;
      const exifBase = ascii(bytes, data, 6) === "Exif\0\0" ? data + 6 : data;
      const tiff = parseTiff(bytes, exifBase);
      metadata.gps = metadata.gps || Boolean(tiff?.metadata.gps);
    } else if (type === "XMP ") {
      metadata.xmp = true;
    }

    offset = data + size + (size % 2);
  }

  return {
    width,
    height,
    bitDepth: 8,
    alpha,
    animated,
    multiplePages: false,
    frameCount: animated ? Math.max(1, frameCount) : 1,
    metadata
  };
}

function skipGifBlocks(bytes: Uint8Array, start: number): number {
  let offset = start;
  while (offset < bytes.length) {
    const size = bytes[offset] ?? 0;
    offset += 1;
    if (size === 0) break;
    offset += size;
  }
  return offset;
}

function parseGif(bytes: Uint8Array): ImageInspectionDetails | undefined {
  const header = ascii(bytes, 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") return undefined;
  if (bytes.length < 13) return undefined;

  const width = (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8);
  const height = (bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8);
  const packed = bytes[10] ?? 0;
  let offset = 13;
  if (packed & 0x80) offset += 3 * (1 << ((packed & 0x07) + 1));

  let frames = 0;
  let alpha = false;

  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;

    if (marker === 0x2c) {
      if (offset + 9 > bytes.length) break;
      const imagePacked = bytes[offset + 8] ?? 0;
      offset += 9;
      if (imagePacked & 0x80) offset += 3 * (1 << ((imagePacked & 0x07) + 1));
      offset += 1;
      offset = skipGifBlocks(bytes, offset);
      frames += 1;
      continue;
    }

    if (marker === 0x21) {
      const label = bytes[offset++];
      if (label === 0xf9 && offset < bytes.length) {
        const blockSize = bytes[offset++] ?? 0;
        if (blockSize >= 1 && offset < bytes.length) alpha = alpha || Boolean((bytes[offset] ?? 0) & 0x01);
        offset += blockSize;
        if (bytes[offset] === 0) offset += 1;
      } else {
        offset = skipGifBlocks(bytes, offset);
      }
      continue;
    }

    break;
  }

  return {
    width,
    height,
    bitDepth: 8,
    alpha,
    animated: frames > 1,
    multiplePages: false,
    frameCount: Math.max(1, frames),
    metadata: emptyMetadata()
  };
}

function parseBmp(bytes: Uint8Array): ImageInspectionDetails | undefined {
  if (bytes.length < 30 || ascii(bytes, 0, 2) !== "BM") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = Math.abs(view.getInt32(18, true));
  const height = Math.abs(view.getInt32(22, true));
  const bitDepth = view.getUint16(28, true);
  return {
    width,
    height,
    bitDepth,
    alpha: bitDepth === 32,
    animated: false,
    multiplePages: false,
    frameCount: 1,
    metadata: emptyMetadata()
  };
}

function parseSvg(bytes: Uint8Array): ImageInspectionDetails | undefined {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 32 * 1024));
  if (!/<svg(?:\s|>)/i.test(text)) return undefined;

  const widthMatch = text.match(/\bwidth\s*=\s*["']\s*([\d.]+)/i);
  const heightMatch = text.match(/\bheight\s*=\s*["']\s*([\d.]+)/i);
  const viewBox = text.match(/\bviewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i);

  const width = widthMatch ? Number(widthMatch[1]) : viewBox ? Number(viewBox[1]) : undefined;
  const height = heightMatch ? Number(heightMatch[1]) : viewBox ? Number(viewBox[2]) : undefined;

  return {
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
    alpha: true,
    animated: false,
    multiplePages: false,
    frameCount: 1,
    metadata: emptyMetadata()
  };
}

export function inspectImageHeader(formatId: string | undefined, bytes: Uint8Array): ImageInspectionDetails | undefined {
  switch (formatId) {
    case "jpeg": return parseJpeg(bytes);
    case "png": return parsePng(bytes);
    case "webp": return parseWebp(bytes);
    case "gif": return parseGif(bytes);
    case "tiff": return parseTiff(bytes);
    case "bmp": return parseBmp(bytes);
    case "svg": return parseSvg(bytes);
    case "avif":
    case "heif":
    case "jxl":
      return { metadata: emptyMetadata() };
    default:
      return undefined;
  }
}
