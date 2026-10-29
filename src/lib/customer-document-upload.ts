const documentTypes = {
  ".pdf": { mime: "application/pdf", supplied: ["application/pdf"] },
  ".jpg": { mime: "image/jpeg", supplied: ["image/jpeg", "image/jpg", "image/pjpeg"] },
  ".jpeg": { mime: "image/jpeg", supplied: ["image/jpeg", "image/jpg", "image/pjpeg"] },
  ".png": { mime: "image/png", supplied: ["image/png", "image/x-png"] },
  ".webp": { mime: "image/webp", supplied: ["image/webp"] },
  ".csv": { mime: "text/csv", supplied: ["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"] },
  ".docx": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    supplied: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  ".xlsx": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    supplied: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  },
} as const;

export const customerDocumentMaximumBytes = 10 * 1024 * 1024;

function extension(filename: string) {
  const match = filename.trim().toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function hasExpectedSignature(fileExtension: string, bytes: Uint8Array) {
  if (fileExtension === ".jpg" || fileExtension === ".jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (fileExtension === ".png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (fileExtension === ".webp") {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  if (fileExtension === ".pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
  if (fileExtension === ".docx" || fileExtension === ".xlsx") {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
      startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);
  }
  if (fileExtension === ".csv") return !bytes.slice(0, 4096).includes(0);
  return false;
}

export function normalizeCustomerDocumentType(filename: string, suppliedType: string, bytes: Uint8Array) {
  const fileExtension = extension(filename);
  const definition = documentTypes[fileExtension as keyof typeof documentTypes];
  if (!definition || bytes.length === 0 || !hasExpectedSignature(fileExtension, bytes)) return null;

  const normalizedSuppliedType = suppliedType.split(";", 1)[0].trim().toLowerCase();
  const genericType = normalizedSuppliedType === "" || normalizedSuppliedType === "application/octet-stream";
  if (!genericType && !(definition.supplied as readonly string[]).includes(normalizedSuppliedType)) return null;
  return definition.mime;
}
