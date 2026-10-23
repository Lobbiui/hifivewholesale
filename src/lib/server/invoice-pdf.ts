type InvoiceItem = {
  name: string;
  quantityCases: number;
  casePriceCents: number | null;
};

export type InvoicePdfData = {
  orderNumber: string;
  submittedAt: Date;
  expiresAt: Date;
  companyName: string;
  contactName: string;
  contactEmail: string;
  purchaseOrderNumber: string | null;
  fulfillmentMethod: string;
  paymentStatus: string;
  paymentReference: string | null;
  estimatedTotalCents: number | null;
  amountPaidCents: number;
  amountRefundedCents: number;
  address: string[];
  items: InvoiceItem[];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function safeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function money(cents: number | null) {
  if (cents === null) return "Pending";
  return `$${(cents / 100).toFixed(2)}`;
}

function date(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function wrap(value: string, maxCharacters: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }
      line = "";
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textCommand(
  value: string,
  x: number,
  y: number,
  size = 10,
  bold = false,
  color = "0.12 0.08 0.16",
) {
  return `${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${safeText(value)}) Tj ET`;
}

function pageHeader(commands: string[], title: string, subtitle: string) {
  commands.push("0.13 0.07 0.18 rg 0 704 612 88 re f");
  commands.push(textCommand("HiFive Supply", 42, 754, 22, true, "1 1 1"));
  commands.push(textCommand(title, 42, 730, 11, true, "0.82 0.65 1"));
  commands.push(
    textCommand(
      subtitle,
      Math.max(390, 570 - subtitle.length * 4.4),
      738,
      8,
      false,
      "1 1 1",
    ),
  );
}

function tableHeader(commands: string[], y: number) {
  commands.push(`0.94 0.92 0.96 rg 42 ${y - 7} 528 23 re f`);
  commands.push(textCommand("ITEM", 50, y, 8, true));
  commands.push(textCommand("CASES", 367, y, 8, true));
  commands.push(textCommand("CASE PRICE", 425, y, 8, true));
  commands.push(textCommand("LINE TOTAL", 502, y, 8, true));
  return y - 28;
}

function buildPageObjects(pageStreams: string[]) {
  const fontNormalId = 3;
  const fontBoldId = 4;
  const firstPageId = 5;
  const pageIds = pageStreams.map((_, index) => firstPageId + index * 2);
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[fontNormalId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[fontBoldId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pageStreams.forEach((stream, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const streamLength = Buffer.byteLength(stream, "ascii");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontNormalId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "binary");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

export function generateInvoicePdf(invoice: InvoicePdfData) {
  const pages: string[][] = [[]];
  let pageIndex = 0;
  let commands = pages[pageIndex];
  pageHeader(commands, "INTERNAL CUSTOMER INVOICE", invoice.orderNumber);

  commands.push(textCommand("BILL TO", 42, 670, 8, true, "0.45 0.22 0.70"));
  commands.push(textCommand(invoice.companyName, 42, 650, 13, true));
  commands.push(textCommand(invoice.contactName || invoice.contactEmail, 42, 634, 9));
  commands.push(textCommand(invoice.contactEmail, 42, 620, 9));
  invoice.address.slice(0, 3).forEach((line, index) => {
    commands.push(textCommand(line, 42, 604 - index * 14, 9));
  });

  const details = [
    ["Invoice date", date(invoice.submittedAt)],
    ["Internal copy expires", date(invoice.expiresAt)],
    ["PO number", invoice.purchaseOrderNumber || "-"],
    ["Fulfillment", invoice.fulfillmentMethod.replaceAll("_", " ")],
    ["Payment", invoice.paymentStatus.replaceAll("_", " ")],
  ];
  details.forEach(([label, value], index) => {
    const y = 670 - index * 24;
    commands.push(textCommand(label.toUpperCase(), 360, y, 7, true, "0.45 0.22 0.70"));
    commands.push(textCommand(value, 478, y, 9, true));
  });

  let y = tableHeader(commands, 535);
  for (const item of invoice.items) {
    const nameLines = wrap(item.name, 49);
    const rowHeight = Math.max(30, nameLines.length * 12 + 12);
    if (y - rowHeight < 92) {
      pageIndex += 1;
      pages.push([]);
      commands = pages[pageIndex];
      pageHeader(commands, "INVOICE CONTINUED", invoice.orderNumber);
      y = tableHeader(commands, 670);
    }
    nameLines.forEach((line, index) => {
      commands.push(textCommand(line, 50, y - index * 12, 9, index === 0));
    });
    commands.push(textCommand(String(item.quantityCases), 382, y, 9));
    commands.push(textCommand(money(item.casePriceCents), 430, y, 9));
    commands.push(
      textCommand(
        item.casePriceCents === null
          ? "Pending"
          : money(item.casePriceCents * item.quantityCases),
        512,
        y,
        9,
        true,
      ),
    );
    y -= rowHeight;
    commands.push(`0.87 0.84 0.89 RG 42 ${y + 7} m 570 ${y + 7} l S`);
  }

  if (y < 175) {
    pageIndex += 1;
    pages.push([]);
    commands = pages[pageIndex];
    pageHeader(commands, "INVOICE TOTALS", invoice.orderNumber);
    y = 650;
  }
  const totals = [
    ["Order total", money(invoice.estimatedTotalCents)],
    ["Amount paid", money(invoice.amountPaidCents)],
    ["Amount refunded", money(invoice.amountRefundedCents)],
  ];
  totals.forEach(([label, value], index) => {
    const totalY = y - 18 - index * 22;
    commands.push(textCommand(label, 390, totalY, 9, index === 0));
    commands.push(textCommand(value, 510, totalY, 10, true));
  });
  if (invoice.paymentReference) {
    commands.push(
      textCommand(
        `Payment transaction: ${invoice.paymentReference}`,
        42,
        y - 18,
        8,
        false,
        "0.35 0.31 0.39",
      ),
    );
  }

  pages.forEach((page, index) => {
    page.push(textCommand("Zervas and Zervas, LLC dba HiFive Supply", 42, 42, 8, true));
    page.push(textCommand("4710 Old Hickory Blvd, Old Hickory, TN 37138 | (615) 840-8105", 42, 29, 7));
    page.push(
      textCommand(
        `Internal invoice copy retention: 30 days | Page ${index + 1} of ${pages.length}`,
        370,
        29,
        7,
        false,
        "0.35 0.31 0.39",
      ),
    );
  });

  return buildPageObjects(pages.map((page) => page.join("\n")));
}
