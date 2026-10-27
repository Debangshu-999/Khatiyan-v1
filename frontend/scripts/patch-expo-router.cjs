const fs = require("node:fs");
const path = require("node:path");

// Expo Router 56.2.20 calls the initial-link callback during render. Android's
// URL promise may resolve before commit (expo/expo#49378). Keep the URL, but
// defer its React state update until mounting and ignore late unmount callbacks.
const guardSource = `
    // khatiyan-initial-link-mount-guard
    const linkingMountStatus = react_1.default.useRef("pending");
    const pendingUnhandledLink = react_1.default.useRef(null);
    const onUnhandledLinkingAfterMount = react_1.default.useCallback((path) => {
        if (linkingMountStatus.current === "pending") {
            pendingUnhandledLink.current = { path };
        } else if (linkingMountStatus.current === "mounted") {
            setLastUnhandledLink(path);
        }
    }, []);
    react_1.default.useEffect(() => {
        linkingMountStatus.current = "mounted";
        const pending = pendingUnhandledLink.current;
        pendingUnhandledLink.current = null;
        if (pending) {
            const currentPath = refContainer.current?.getCurrentRoute()?.path;
            setLastUnhandledLink(pending.path === currentPath ? undefined : pending.path);
        }
        return () => {
            linkingMountStatus.current = "unmounted";
            pendingUnhandledLink.current = null;
        };
    }, []);
`;

function patchSource(source) {
  if (source.includes("// khatiyan-initial-link-mount-guard")) return source;
  const stateAnchor = "    const [lastUnhandledLink, setLastUnhandledLink] = react_1.default.useState();";
  const callbackAnchor = "    }, setLastUnhandledLink);";
  if (source.split(stateAnchor).length !== 2 || source.split(callbackAnchor).length !== 2) {
    throw new Error("Expo Router linking code changed; review the initial-link mount guard before applying it.");
  }
  return source.replace(stateAnchor, stateAnchor + guardSource)
    .replace(callbackAnchor, "    }, onUnhandledLinkingAfterMount);");
}

if (require.main === module) {
  const target = path.join(path.dirname(require.resolve("expo-router/package.json")), "build/fork/NavigationContainer.js");
  const source = fs.readFileSync(target, "utf8");
  const patched = patchSource(source);
  if (patched !== source) fs.writeFileSync(target, patched);
  console.log("Expo Router initial-link mount guard applied.");
}

module.exports = { guardSource, patchSource };
