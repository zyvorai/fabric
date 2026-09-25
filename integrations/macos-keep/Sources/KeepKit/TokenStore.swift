import Foundation
import Security

public protocol TokenStore: Sendable {
    func token() throws -> String?
    func save(_ token: String) throws
    func clear() throws
}

/// The token lives in the macOS Keychain (this device only, available after first unlock), never in preferences or a file.
public struct KeychainTokenStore: TokenStore {
    public let service: String
    public let account: String
    public init(service: String = "dev.zyvor.keep.token", account: String = "default") { self.service = service; self.account = account }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    public func token() throws -> String? {
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = out as? Data else { throw KeychainError.status(status) }
        return String(data: data, encoding: .utf8)
    }

    public func save(_ token: String) throws {
        try clear()
        var q = query
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(q as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }

    public func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError.status(status) }
    }
}

public enum KeychainError: Error, Equatable, LocalizedError {
    case status(OSStatus)
    public var errorDescription: String? {
        if case .status(let s) = self { return (SecCopyErrorMessageString(s, nil) as String?) ?? "Keychain error \(s)" }
        return nil
    }
}

/// For tests and previews.
public final class InMemoryTokenStore: TokenStore, @unchecked Sendable {
    private var value: String?
    private let lock = NSLock()
    public init(_ value: String? = nil) { self.value = value }
    public func token() throws -> String? { lock.lock(); defer { lock.unlock() }; return value }
    public func save(_ token: String) throws { lock.lock(); value = token; lock.unlock() }
    public func clear() throws { lock.lock(); value = nil; lock.unlock() }
}
