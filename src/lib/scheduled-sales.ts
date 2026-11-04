export const scheduledSaleTimeZone = "America/Chicago";

export type ScheduledSale = {
  id?: string;
  price: number;
  startsAt: string;
  endsAt: string;
};

const centralFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: scheduledSaleTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function centralParts(value: Date) {
  const parts = Object.fromEntries(
    centralFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function formatCentralDateTimeInput(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const part = centralParts(date);
  return `${String(part.year).padStart(4, "0")}-${String(part.month).padStart(2, "0")}-${String(part.day).padStart(2, "0")}T${String(part.hour).padStart(2, "0")}:${String(part.minute).padStart(2, "0")}`;
}

export function parseCentralDateTimeInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  let guess = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const represented = centralParts(new Date(guess));
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
    );
    guess += target - representedUtc;
  }
  const result = new Date(guess);
  return formatCentralDateTimeInput(result) === value ? result : null;
}

export function defaultScheduledSale(): ScheduledSale {
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    price: 0,
    startsAt: formatCentralDateTimeInput(start),
    endsAt: formatCentralDateTimeInput(end),
  };
}

export function scheduledSaleStatus(
  sale: ScheduledSale | null | undefined,
  now = new Date(),
) {
  if (!sale) return "NONE" as const;
  const startsAt = parseCentralDateTimeInput(sale.startsAt);
  const endsAt = parseCentralDateTimeInput(sale.endsAt);
  if (!startsAt || !endsAt) return "INVALID" as const;
  if (now < startsAt) return "SCHEDULED" as const;
  if (now >= endsAt) return "ENDED" as const;
  return "ACTIVE" as const;
}

export function formatSaleEnd(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: scheduledSaleTimeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
