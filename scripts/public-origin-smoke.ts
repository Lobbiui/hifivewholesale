import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolvePublicSiteOrigin } from "../src/lib/public-origin";

assert.equal(
  resolvePublicSiteOrigin({
    configured: null,
    forwardedHost: null,
    forwardedProto: null,
    host: "localhost:3000",
    requestUrl: "http://localhost:3000/api/admin/applications/example",
    production: true,
  }),
  "https://hifivesupply.com",
);
assert.equal(
  resolvePublicSiteOrigin({
    configured: null,
    forwardedHost: "hifivesupply.com",
    forwardedProto: "https",
    host: "localhost:3000",
    requestUrl: "http://localhost:3000/api/admin/customers",
    production: true,
  }),
  "https://hifivesupply.com",
);
assert.equal(
  resolvePublicSiteOrigin({
    configured: "http://localhost:3000",
    forwardedHost: null,
    forwardedProto: null,
    host: "localhost:3000",
    requestUrl: "http://localhost:3000/api/auth/password-reset",
    production: true,
  }),
  "https://hifivesupply.com",
);
assert.equal(
  resolvePublicSiteOrigin({
    configured: null,
    forwardedHost: null,
    forwardedProto: null,
    host: "localhost:3000",
    requestUrl: "http://localhost:3000/api/admin/customers",
    production: false,
  }),
  "http://localhost:3000",
);

async function main() {
  const applicationRoute = await readFile(
    "src/app/api/admin/applications/[id]/route.ts",
    "utf8",
  );
  assert.doesNotMatch(applicationRoute, /new URL\([^\n]+request\.url/);
  assert.match(applicationRoute, /publicSiteOrigin\(request\)/);

  console.log("Production public URL and activation-link workflow passed.");
}

void main();
