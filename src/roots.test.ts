import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assertAllowedPath,
  expandHomePath,
  resolveAllowedPath,
  resolveCanonicalAllowedPath,
  resolvePathInsideCanonicalRoot,
} from "./roots.js";

const home = homedir();

assert.equal(expandHomePath("~"), home);
assert.equal(expandHomePath("~/personal/devspace"), resolve(home, "personal", "devspace"));
assert.equal(expandHomePath("~user/project"), "~user/project");
assert.equal(expandHomePath("$HOME/project"), "$HOME/project");

assert.equal(
  assertAllowedPath("~/personal/devspace", [join(home, "personal")]),
  resolve(home, "personal", "devspace"),
);

assert.equal(
  assertAllowedPath("~/personal/devspace", ["~/personal"]),
  resolve(home, "personal", "devspace"),
);

assert.equal(
  resolveAllowedPath("~/file.txt", "/workspace", ["/workspace"]),
  resolve("/workspace", "~/file.txt"),
);

if (process.platform === "win32") {
  assert.throws(
    () => assertAllowedPath("C:\\Users\\Administrator", ["G:\\Projects\\Dev\\Github\\devspace"]),
    /Path is outside allowed roots/,
  );
}

const fixtureRoot = await mkdtemp(join(tmpdir(), "devspace-roots-test-"));
try {
  const workspace = join(fixtureRoot, "workspace");
  const inside = join(workspace, "inside");
  const outside = join(fixtureRoot, "outside");
  await mkdir(inside, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "secret.txt"), "secret\n");

  const canonicalWorkspace = await realpath(workspace);
  const outsideLink = join(workspace, "outside-link");
  await symlink(outside, outsideLink, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(
    resolvePathInsideCanonicalRoot("outside-link/secret.txt", workspace, workspace, canonicalWorkspace),
    /outside allowed roots/,
  );
  await assert.rejects(
    resolvePathInsideCanonicalRoot("outside-link/new.txt", workspace, workspace, canonicalWorkspace),
    /outside allowed roots/,
  );

  const insideLink = join(workspace, "inside-link");
  await symlink(inside, insideLink, process.platform === "win32" ? "junction" : "dir");
  assert.equal(
    await resolvePathInsideCanonicalRoot("inside-link/new.txt", workspace, workspace, canonicalWorkspace),
    join(await realpath(inside), "new.txt"),
  );

  const missingRoot = join(fixtureRoot, "missing-root");
  await assert.rejects(
    resolveCanonicalAllowedPath(join(missingRoot, "project"), fixtureRoot, [missingRoot]),
    /outside allowed roots/,
  );

  if (process.platform !== "win32") {
    const danglingLink = join(workspace, "dangling-link");
    await symlink(join(outside, "missing.txt"), danglingLink);
    await assert.rejects(
      resolvePathInsideCanonicalRoot("dangling-link", workspace, workspace, canonicalWorkspace),
      /Cannot resolve symbolic link/,
    );
  }
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
