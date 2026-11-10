import AppKit
import ApplicationServices

// Read-only Accessibility helper. No screenshots, Apple Events or simulated clicks.
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func elements(_ element: AXUIElement, _ name: String) -> [AXUIElement] {
    attribute(element, name) as? [AXUIElement] ?? []
}
func text(_ element: AXUIElement, _ name: String) -> String {
    (attribute(element, name) as? String ?? "").precomposedStringWithCanonicalMapping
}
func rect(_ element: AXUIElement) -> CGRect? {
    guard let p = attribute(element, kAXPositionAttribute), let s = attribute(element, kAXSizeAttribute),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero; var size = CGSize.zero
    guard AXValueGetValue(unsafeBitCast(p, to: AXValue.self), .cgPoint, &point),
          AXValueGetValue(unsafeBitCast(s, to: AXValue.self), .cgSize, &size), size.width >= 2, size.height >= 2 else { return nil }
    return CGRect(origin: point, size: size)
}
func box(_ r: CGRect) -> [String: Any] { ["x": r.minX, "y": r.minY, "w": r.width, "h": r.height] }
func windows(_ pid: pid_t) -> [AXUIElement] {
    elements(AXUIElementCreateApplication(pid), kAXWindowsAttribute).filter {
        guard let r = rect($0), r.width >= 100, r.height >= 80 else { return false }
        // Finder's desktop / sharing surfaces are not navigable folder windows.
        guard text($0, kAXRoleAttribute) == "AXWindow", !text($0, kAXTitleAttribute).isEmpty else { return false }
        return (attribute($0, kAXMinimizedAttribute) as? Bool) != true
    }
}
func processName(_ app: NSRunningApplication) -> String {
    app.bundleIdentifier == "com.apple.finder" ? "Finder" : (app.localizedName ?? "")
}
func matches(_ value: String, _ pattern: String) -> Bool {
    value.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
}
func query(_ q: [String: Any]) -> [String: Any] {
    guard AXIsProcessTrusted() else { return ["error": "access"] }
    let scope = q["scope"] as? String ?? "top"
    var roots: [(AXUIElement, String)] = []
    let apps = NSWorkspace.shared.runningApplications
    if scope == "taskbar" {
        if let dock = apps.first(where: { $0.bundleIdentifier == "com.apple.dock" }) {
            roots.append((AXUIElementCreateApplication(dock.processIdentifier), "Dock"))
        }
    } else if scope.hasPrefix("proc:") {
        let pattern = String(scope.dropFirst(5))
        for app in apps where matches(processName(app), pattern) {
            let ws = windows(app.processIdentifier)
            for w in (q["firstWindow"] as? Bool == true ? Array(ws.prefix(1)) : ws) { roots.append((w, processName(app))) }
        }
    } else {
        let skip = (q["skipPid"] as? Int).map(pid_t.init) ?? 0
        let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        for info in list {
            guard let pid = info[kCGWindowOwnerPID as String] as? Int, pid_t(pid) != skip,
                  info[kCGWindowLayer as String] as? Int == 0,
                  let bounds = info[kCGWindowBounds as String] as? [String: CGFloat],
                  (bounds["Width"] ?? 0) >= 100, (bounds["Height"] ?? 0) >= 80,
                  let app = apps.first(where: { $0.processIdentifier == pid_t(pid) }),
                  let w = windows(pid_t(pid)).first else { continue }
            roots.append((w, processName(app))); break
        }
    }
    guard let first = roots.first else { return ["items": [], "error": "no_window"] }
    var win: [String: Any] = ["title": text(first.0, kAXTitleAttribute), "proc": first.1,
                              "document": text(first.0, kAXDocumentAttribute)]
    if let r = rect(first.0) { win["rect"] = box(r) }
    if q["op"] as? String == "top" || q["op"] as? String == "window" {
        if let close = attribute(first.0, kAXCloseButtonAttribute), CFGetTypeID(close) == AXUIElementGetTypeID(),
           let r = rect(unsafeBitCast(close, to: AXUIElement.self)) { win["close"] = box(r) }
        return ["win": win]
    }
    let roles = q["roles"] as? [String] ?? []
    let pattern = q["name"] as? String ?? ""
    var items: [[String: Any]] = []
    for (root, proc) in roots {
        var stack = elements(root, kAXChildrenAttribute).reversed().map { $0 }
        let windowRect = scope == "taskbar" ? nil : rect(root)
        var visited = 0
        while let e = stack.popLast(), visited < 3000, items.count < 6 {
            visited += 1
            if attribute(e, "AXHidden") as? Bool == true { continue }
            stack.append(contentsOf: elements(e, kAXChildrenAttribute).reversed())
            let role = text(e, kAXRoleAttribute)
            if !roles.isEmpty && !roles.contains(role) { continue }
            let name = [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, "AXHelp", "AXIdentifier"].map { text(e, $0) }.filter { !$0.isEmpty }.joined(separator: " ")
            if !pattern.isEmpty && !matches(name, pattern) { continue }
            guard var r = rect(e) else { continue }
            // Finder exposes its paired arrows as one AXButton. Point at Back's half.
            if role == "AXButton" && name.lowercased().contains("back/forward") && matches("back", pattern) && !matches("forward", pattern) {
                r.size.width /= 2
            }
            if let wr = windowRect { r = r.intersection(wr); if r.isNull || r.width < 2 || r.height < 2 { continue } }
            var item = box(r)
            item["name"] = name; item["type"] = role; item["proc"] = proc
            item["focused"] = attribute(e, kAXFocusedAttribute) as? Bool ?? false
            item["enabled"] = attribute(e, kAXEnabledAttribute) as? Bool ?? true
            items.append(item)
        }
        if items.count >= 6 { break }
    }
    return ["items": items, "win": win]
}
var output: [String: Any]
if let input = CommandLine.arguments.dropFirst().first?.data(using: .utf8),
   let q = try? JSONSerialization.jsonObject(with: input) as? [String: Any] {
    output = query(q)
} else { output = ["error": "invalid_query"] }
if let data = try? JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]), let json = String(data: data, encoding: .utf8) { print(json) }
