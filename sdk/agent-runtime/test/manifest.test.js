// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { buildManifest } from "../src/manifest.js";

const base = () => ({ template: "t", credential: [], allowHost: [], skill: [], allowPrivateNetwork: false });

test("a deploy with no newer flags keeps the original manifest shape", () => {
  const manifest = buildManifest(base(), "node");
  for (const key of ["egress_mode", "home_volume", "resources", "skills", "skill_scope", "egress_approval_timeout_seconds"]) {
    assert.equal(key in manifest, false, key);
  }
  assert.equal(manifest.warm_pool_size, 0);
  assert.equal(manifest.runtime_port, 8080);
});

test("egress mode and approval timeout", () => {
  const m = buildManifest({ ...base(), egressMode: "sentinel", egressApprovalTimeout: "60" }, "node");
  assert.equal(m.egress_mode, "sentinel");
  assert.equal(m.egress_approval_timeout_seconds, 60);
  assert.throws(() => buildManifest({ ...base(), egressMode: "allow" }, "node"), /--egress-mode/);
  assert.throws(() => buildManifest({ ...base(), egressApprovalTimeout: "0" }, "node"), /positive integer/);
});

test("home volume flags", () => {
  assert.deepEqual(buildManifest({ ...base(), homeVolume: true }, "node").home_volume, {});
  assert.deepEqual(
    buildManifest({ ...base(), perUserHome: true, homeVolumeName: "browser-home", homePath: "/home/agent" }, "node").home_volume,
    { name: "browser-home", guest_path: "/home/agent", per_user: true },
  );
});

test("sandbox size needs both numbers", () => {
  const m = buildManifest({ ...base(), vcpus: "2", memoryMib: "7900" }, "node");
  assert.deepEqual(m.resources, { vcpus: 2, memory_mib: 7900 });
  assert.throws(() => buildManifest({ ...base(), vcpus: "2" }, "node"), /together/);
  assert.throws(() => buildManifest({ ...base(), vcpus: "x", memoryMib: "1" }, "node"), /positive integer/);
});

test("skills", () => {
  const m = buildManifest({ ...base(), skill: ["review", "lint@abc123"], skillScope: "team" }, "node");
  assert.deepEqual(m.skills, ["review", "lint@abc123"]);
  assert.equal(m.skill_scope, "team");
});
