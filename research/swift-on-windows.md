# Swift on Windows: Runtime Research

**Date:** 2026-02-03
**Purpose:** Evaluate the maturity, support, and viability of the Swift runtime on Windows.

---

## Executive Summary

Swift has been officially supported on Windows since **Swift 5.3 (September 2020)**. As of early 2026, the latest stable release is **Swift 6.2.3**, available for both x86_64 and arm64 Windows architectures. The Windows port is a community-driven effort within the official Swift open-source project, stewarded by Apple but not a primary Apple investment. Microsoft does not directly support or contribute to the Swift Windows runtime. Two companies -- **The Browser Company** and **Readdle** -- ship production Windows applications built with Swift, demonstrating real-world viability. A dedicated **Windows Workgroup** was announced in January 2026, signaling increased organizational commitment to the platform.

The runtime is usable for production workloads today, particularly for shared business logic and native GUI applications via WinRT/WinUI interop. However, notable gaps remain in Foundation's networking module, SwiftNIO support, REPL availability, and some C++ interop edge cases.

---

## History and Timeline

| Date | Milestone |
|------|-----------|
| Dec 2015 | Apple open-sources Swift; only Darwin and Linux supported |
| Q2 2019 | Readdle begins experimenting with Swift on Windows for Spark |
| Jan 2020 | Saleem Abdulrasool joins Swift Core Team |
| Sep 2020 | **Swift 5.3** officially ships Windows support (compiler, stdlib, core libs) |
| 2022 | Apple announces pure-Swift Foundation rewrite (`swift-foundation`) |
| 2023 | The Browser Company ships Arc browser on Windows using Swift |
| 2024 | Swift/WinRT and WinUI bindings open-sourced |
| Jan 2026 | **Windows Workgroup** announced by Swift project |
| Jan 2026 | **Swift 6.2.3** is the current stable release for Windows |

---

## Relationship to Apple's Core Effort

Swift on Windows is part of the **official Swift open-source project** under the `swiftlang` GitHub organization, which Apple controls. However, the relationship is nuanced:

- **Apple is the toolchain provider and platform owner** for Windows according to swift.org's platform support page. Apple re-signs Windows toolchain builds under the swift.org certificate for distribution.
- **Apple does not appear to invest heavily in Windows-specific development.** As The Register noted, Apple "has little incentive to invest in platforms other than its own."
- The heavy lifting for Windows support has been done by **community contributors**, most notably Saleem Abdulrasool (now at The Browser Company, previously at Google Brain).
- The **swift-foundation** rewrite (pure Swift Foundation) directly benefits Windows by removing the dependency on the Objective-C-based Darwin Foundation. On Linux and Windows, importing Foundation now uses the new pure-Swift implementation automatically.
- Apple's Mishal Shah (Swift Core Team member) leads the newly formed Windows Workgroup, indicating Apple is providing organizational support even if not dedicating significant engineering resources.

---

## Microsoft's Involvement

**Microsoft does not directly support or contribute to the Swift runtime on Windows.** Their involvement is indirect:

- **Tooling dependency:** Swift on Windows requires **Visual Studio 2022** (for the C++ toolchain and Windows SDK). This is a prerequisite, not a partnership.
- **VS Code extension:** The Swift VS Code extension (published by the Swift Server Workgroup) provides IDE support including debugging, testing, code navigation, and autocomplete.
- **WinGet distribution:** Swift can be installed via Windows Package Manager (`winget`), Microsoft's official package manager.
- **microsoft/swift-guide:** Microsoft maintains a [Swift coding guidelines repository](https://github.com/microsoft/swift-guide) for internal best practices, but this is focused on their iOS development teams, not Windows Swift development.
- **.NET interop:** Microsoft's .NET team is working on [Swift-to-C# interop bindings](https://github.com/dotnet/runtime/issues/95638) targeting Apple platforms (not Windows Swift).
- **WinObjC (deprecated):** Microsoft previously had a [Windows Bridge for iOS](https://github.com/Microsoft/WinObjC) project with a community request for Swift support, but this project was abandoned.
- **Miguel de Icaza** (Microsoft, Xamarin creator) publicly praised Swift, saying "there is plenty to love about Swift technically."

**Bottom line:** Microsoft provides the underlying Windows build tools that Swift depends on, but has no official partnership, funding, or engineering contribution to the Swift-on-Windows effort.

---

## Contributors and Community

### Key Contributors

| Person | Affiliation | Role |
|--------|------------|------|
| **Saleem Abdulrasool** | The Browser Company (prev. Google Brain, Microsoft, Facebook) | Swift Core Team member; primary architect of Windows port; 6+ years of effort |
| **Mishal Shah** | Apple | Swift Core Team; leads Windows Workgroup |
| **Max Desiatov** | Community | Cross-platform Swift contributor (WebAssembly, Windows) |
| **Readdle team** | Readdle | Early adopters; contributed tooling and bug reports |

### Contributor Scale

- The main `swiftlang/swift` repository has **~69,600 stars** and **~10,600 forks** with thousands of contributors overall. Windows-specific contributors are a subset of this.
- The `swiftlang` GitHub organization has **70 repositories** and **4,900+ followers**.
- The Windows Workgroup meets **biweekly (Wednesdays at 9:00 AM PT)** and membership is open to all.
- The Browser Company has dedicated compiler engineers working on Swift/Windows full-time.

### Community Health Assessment

The Windows-specific contributor base is **small but growing**. The effort has historically been driven by a handful of individuals (primarily Saleem Abdulrasool). The formation of the Windows Workgroup in January 2026 is a structural improvement designed to broaden participation. The Browser Company's investment in hiring compiler engineers specifically for Windows Swift work is the most significant commercial contribution.

---

## Production Use Cases

### The Browser Company -- Arc Browser
- Built Arc for Windows using Swift, sharing **~80% of codebase** with the macOS version
- First modern Windows browser to use **WinUI 3.0** (Windows native design language)
- Built custom **Swift/WinRT language projection** to access Windows Runtime APIs from Swift
- Open-sourced their interop tooling for the community
- Employs dedicated compiler engineers to improve Swift on Windows

### Readdle -- Spark Email
- Began porting Spark's core business logic (written in Swift) to Windows in 2019
- Uses a cross-platform architecture: Swift Core module with platform-native UI on each target
- Successfully ships production Windows application
- Contributed tooling (`readdle/swift-windows-gha` -- GitHub Actions helper for Swift on Windows CI)

---

## Technical Capabilities and Maturity

### What Works Well

| Component | Status | Notes |
|-----------|--------|-------|
| **Compiler** | Mature | Full Swift 6.2 language support |
| **Standard Library** | Mature | Complete and functional |
| **Swift Package Manager** | Supported | `swift build`, `swift test` work |
| **Foundation (core)** | Functional | New pure-Swift implementation auto-used on Windows |
| **Swift Concurrency** | Supported | async/await, actors, structured concurrency |
| **C Interop** | Mature | WinSDK clang module exposes Windows C APIs |
| **C++ Interop** | Functional (Swift 5.9+) | Some limitations remain (virtual methods, copyable types) |
| **COM Interop** | Functional | Maps naturally to Swift ARC; used for DirectX |
| **WinRT/WinUI** | Functional | Via The Browser Company's swift-winrt projection |
| **SourceKit-LSP** | Supported | Powers VS Code extension |
| **Debugger (LLDB)** | Supported | Breakpoints, stepping, variable inspection |
| **XCTest** | Supported | Unit and integration testing |
| **Docker images** | Available | `windowsservercore-ltsc2022` images |
| **x86_64 + arm64** | Both supported | Official installers for both architectures |

### Known Limitations and Gaps

| Area | Issue | Severity |
|------|-------|----------|
| **REPL** | Not available on Windows | Low |
| **FoundationNetworking** | URLSession, URLRequest require separate `import FoundationNetworking` on non-Darwin | Medium |
| **SwiftNIO** | No Windows support as of mid-2025 | High (for server use) |
| **Bundle paths** | Incorrect leading slash on Windows paths after Foundation re-coring | Medium |
| **C++ interop + Foundation** | swift-foundation broken with C++ interop enabled due to UCRT module conflict | High |
| **WinRT binding coverage** | Not all APIs can be generated due to export limit issues | Medium |
| **C++ virtual methods** | Not yet available in C++ interop | Medium |
| **Runtime size** | Foundation + ICU adds ~100MB to deployment | Medium |
| **Ecosystem maturity** | Fewer Windows-compatible Swift packages than macOS/Linux | Medium |

---

## Installation and Distribution

### Official Distribution Point

**https://www.swift.org/install/windows/**

### Installation Methods

1. **WinGet (Recommended)**
   ```
   winget install --id Swift.Toolchain
   ```

2. **Manual Installer (.exe)**
   Direct download from swift.org for x86_64 and arm64

3. **Scoop**
   Via the Scoop package manager

4. **Docker**
   Official images: `swift:6.2.3-windowsservercore-ltsc2022`

### Prerequisites

- Windows 10.0 or later
- Visual Studio 2022 Community with:
  - Windows 11 SDK (22621)
  - VC++ Tools for x86/x64
  - VC++ Tools for ARM64

### Default Install Location

`%LocalAppData%\Programs\Swift`

---

## Key Repositories

### Official Swift Project (swiftlang org)

| Repository | Stars | Description |
|-----------|-------|-------------|
| [swiftlang/swift](https://github.com/swiftlang/swift) | 69.6k | The Swift compiler and runtime |
| [swiftlang/swift-foundation](https://github.com/swiftlang/swift-foundation) | -- | Pure-Swift Foundation (used on Windows/Linux) |
| [swiftlang/swift-corelibs-foundation](https://github.com/swiftlang/swift-corelibs-foundation) | -- | Core libraries Foundation implementation |
| [swiftlang/swift-package-manager](https://github.com/swiftlang/swift-package-manager) | 10k | Swift Package Manager |
| [swiftlang/sourcekit-lsp](https://github.com/swiftlang/sourcekit-lsp) | 3.7k | Language Server Protocol implementation |
| [swiftlang/vscode-swift](https://github.com/swiftlang/vscode-swift) | 1k | VS Code extension for Swift |

### The Browser Company (Windows-specific)

| Repository | Stars | Description |
|-----------|-------|-------------|
| [thebrowsercompany/swift-winrt](https://github.com/thebrowsercompany/swift-winrt) | 805 | Swift language projection for WinRT |
| [thebrowsercompany/swift-build](https://github.com/thebrowsercompany/swift-build) | 383 | Swift toolchain builds |
| [thebrowsercompany/windows-samples](https://github.com/thebrowsercompany/windows-samples) | 281 | Sample apps for Swift on Windows (archived) |
| [thebrowsercompany/swift-winui](https://github.com/thebrowsercompany/swift-winui) | 137 | Swift bindings for WinUI3 (archived) |
| [thebrowsercompany/swift-webdriver](https://github.com/thebrowsercompany/swift-webdriver) | 118 | WebDriver/WinAppDriver testing library |

### Other Relevant Repos

| Repository | Description |
|-----------|-------------|
| [readdle/swift-windows-gha](https://github.com/readdle/swift-windows-gha) | GitHub Actions helper for Swift on Windows CI |
| [microsoft/swift-guide](https://github.com/microsoft/swift-guide) | Microsoft's Swift coding best practices (iOS-focused) |
| [PureSwift/SwiftFoundation](https://github.com/PureSwift/SwiftFoundation) | Community cross-platform Foundation alternative |

---

## Maturity Assessment

| Dimension | Rating | Justification |
|-----------|--------|---------------|
| **Compiler stability** | High | 6 years of development; production-proven |
| **Standard library** | High | Complete and well-tested |
| **Foundation** | Medium-High | Pure-Swift rewrite improves cross-platform; some Windows-specific bugs remain |
| **GUI development** | Medium | WinRT/WinUI interop exists but requires third-party tooling (swift-winrt) |
| **Server-side** | Low-Medium | No SwiftNIO support limits async networking |
| **Tooling/IDE** | Medium-High | VS Code extension is functional; no Xcode equivalent |
| **Package ecosystem** | Medium | Many packages work; some assume Darwin |
| **Community size** | Small-Medium | Growing; Windows Workgroup is new |
| **Commercial backing** | Medium | The Browser Company invests significantly; Apple provides governance |
| **Documentation** | Medium | Official docs exist; community resources growing |

### Overall Verdict

Swift on Windows is **production-viable for specific use cases**, particularly:
- Cross-platform applications sharing business logic with Apple platforms
- Native Windows GUI applications via WinRT/WinUI interop
- Command-line tools and utilities

It is **not yet mature enough for**:
- Server-side Windows applications requiring async networking (no SwiftNIO)
- Projects requiring deep C++ interop with Foundation enabled simultaneously
- Developers expecting the same ecosystem richness as on macOS

The formation of the Windows Workgroup and The Browser Company's ongoing investment are positive signals, but the contributor base remains small relative to the platform's ambitions.

---

## Sources

- [Swift.org: Announcing the Windows Workgroup](https://www.swift.org/blog/announcing-windows-workgroup/) (Jan 2026)
- [Swift.org: Introducing Swift on Windows](https://www.swift.org/blog/swift-on-windows/) (Sep 2020)
- [Swift.org: Swift Everywhere -- Windows Interop](https://www.swift.org/blog/swift-everywhere-windows-interop/)
- [Swift.org: Platform Support](https://www.swift.org/platform-support/)
- [Swift.org: Install Swift on Windows](https://www.swift.org/install/windows/)
- [InfoWorld: Using Swift with WinUI on Windows](https://www.infoworld.com/article/2335273/using-swift-with-winui-on-windows.html)
- [The Browser Company: Speaking in Swift (Substack)](https://speakinginswift.substack.com/)
- [Readdle: Swift on Windows Experience](https://sparkmailapp.com/blog/swift-windows)
- [swiftlang/swift GitHub Repository](https://github.com/swiftlang/swift)
- [swiftlang/swift-foundation GitHub Repository](https://github.com/swiftlang/swift-foundation)
- [thebrowsercompany GitHub Organization](https://github.com/thebrowsercompany)
- [Swift Forums: Foundation on Windows](https://forums.swift.org/t/is-foundation-still-incomplete-on-windows/54824)
- [Swift Forums: SwiftNIO for Windows Status](https://forums.swift.org/t/mid-year-2025-swiftnio-for-windows-status/81143)
- [The Register: Swift for Windows](https://www.theregister.com/2020/09/23/swift_windows/)
