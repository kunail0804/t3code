// @effect-diagnostics nodeBuiltinImport:off - tests use POSIX path joining to match the Linux startup boundary.
import * as NodePath from "node:path";
import { assert, describe, it } from "@effect/vitest";

import { resolveEarlyLinuxElectronOptions } from "./DesktopEarlyElectronStartup.ts";

// This is the path that reaches the compositor: DesktopPreReadyPlatform feeds
// its result to setDesktopName and to the Chromium --class switch, and writes
// the URL-handler .desktop entry under that name. DesktopEnvironment resolves
// the same identity for the URL handler and the snapshot, and the two must
// agree, so the override belongs here too.
describe("DesktopEarlyElectronStartup fork identity", () => {
  const joinPath = NodePath.posix.join;
  const readFileString = () => JSON.stringify({ linuxPasswordStore: "auto" });

  it("keeps upstream's Linux identity when no override is set", () => {
    const options = resolveEarlyLinuxElectronOptions({
      env: { T3CODE_HOME: "/home/user/.t3-test" },
      homeDirectory: "/home/user",
      joinPath,
      readFileString,
    });

    assert.equal(options.linuxDesktopEntryName, "com.t3tools.T3Code.desktop");
    assert.equal(options.linuxWmClass, "t3code");
  });

  it("takes the Linux identity from T3CODE_DESKTOP_LINUX_APP_ID", () => {
    const options = resolveEarlyLinuxElectronOptions({
      env: {
        T3CODE_HOME: "/home/user/.t3-test",
        T3CODE_DESKTOP_LINUX_APP_ID: " t3code-fork ",
      },
      homeDirectory: "/home/user",
      joinPath,
      readFileString,
    });

    assert.equal(options.linuxDesktopEntryName, "t3code-fork.desktop");
    assert.equal(options.linuxWmClass, "t3code-fork");
  });
});
