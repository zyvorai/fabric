import Foundation

public enum KeepError: Error, Equatable, LocalizedError, Sendable {
    case badURL
    case unauthorized
    case http(status: Int, message: String)
    case transport(String)
    case decoding(String)
    case tooLarge(name: String, bytes: Int, limit: Int)

    public var errorDescription: String? {
        switch self {
        case .badURL: return "The host address is not a valid http(s) URL."
        case .unauthorized: return "The host refused the token (401). Check the token, or that it has not expired or been revoked."
        case .http(let status, let message): return "The host answered \(status): \(message)"
        case .transport(let m): return "Could not reach the host: \(m)"
        case .decoding(let m): return "The host's reply was not what this app expects: \(m)"
        case .tooLarge(let name, let bytes, let limit):
            return "\(name) is \(bytes / 1024) KB; this use case takes at most \(limit / 1024) KB."
        }
    }
}

/// A client for the Keep runtime API. The token goes in the Authorization header only, never in a URL
/// (the runtime refuses a user token in a query string).
public struct KeepClient: Sendable {
    public let baseURL: URL
    private let token: String
    private let session: URLSession

    public init(baseURL: URL, token: String, session: URLSession = .shared) throws {
        guard let scheme = baseURL.scheme?.lowercased(), scheme == "http" || scheme == "https", baseURL.host != nil else {
            throw KeepError.badURL
        }
        self.baseURL = baseURL; self.token = token; self.session = session
    }

    // MARK: endpoints

    public func status() async throws -> KeepStatus { try await get("/v1/keep/status") }

    public func demos() async throws -> [Demo] {
        (try await get("/v1/demos") as DemosResponse).demos.sorted { $0.id < $1.id }
    }

    public func artifacts(limit: Int? = nil) async throws -> [Artifact] {
        var q: [URLQueryItem] = []
        if let limit { q.append(URLQueryItem(name: "limit", value: String(limit))) }
        return (try await get("/v1/artifacts", query: q) as ArtifactsResponse).items
    }

    public func artifact(id: String) async throws -> Artifact { try await get("/v1/artifacts/\(escape(id))") }

    /// The runtime's own comparison of two artifacts, as raw JSON text.
    public func diff(_ a: String, _ b: String) async throws -> String {
        let (data, _) = try await send(request("/v1/artifacts/\(escape(a))/diff/\(escape(b))"))
        return String(decoding: data, as: UTF8.self)
    }

    public func inbox(userId: String? = nil) async throws -> Inbox {
        try await get("/v1/inbox", query: userId.map { [URLQueryItem(name: "user_id", value: $0)] } ?? [])
    }

    public func approvals() async throws -> [Approval] { (try await get("/v1/approvals") as ApprovalsResponse).items }

    public func usage(userId: String? = nil) async throws -> UsageReport {
        try await get("/v1/usage", query: userId.map { [URLQueryItem(name: "user_id", value: $0)] } ?? [])
    }

    /// Decide an approval. With device signing required the runtime refuses an unsigned decision.
    public func decide(approval id: String, _ decision: Decision, deviceId: String? = nil, signature: String? = nil) async throws {
        var body: [String: String] = ["decision": decision.rawValue]
        if let deviceId { body["device_id"] = deviceId }
        if let signature { body["signature"] = signature }
        var req = request("/v1/approvals/\(escape(id))", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        _ = try await send(req)
    }

    /// Enrol this Mac's key as a device for a user (operator token only; a user token is refused).
    public func enrolDevice(user: String, deviceId: String, publicKeyBase64: String, name: String) async throws {
        let body: [String: Any] = ["device_id": deviceId, "alg": "p256", "public_key": publicKeyBase64, "name": name]
        var req = request("/v1/users/\(escape(user))/devices", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        _ = try await send(req)
    }

    /// Run a use case on one file, or on several (one cell each). HTTP 207 (some failed) is not an error.
    public func run(demo: String, files: [URL], maxBytes: Int? = nil) async throws -> RunOutcome {
        precondition(!files.isEmpty, "run needs at least one file")
        if let maxBytes {
            for f in files {
                let size = (try? FileManager.default.attributesOfItem(atPath: f.path)[.size] as? Int) ?? 0
                if size > maxBytes { throw KeepError.tooLarge(name: f.lastPathComponent, bytes: size, limit: maxBytes) }
            }
        }
        let body = try MultipartBody.write(parts: files.map { .init(filename: $0.lastPathComponent, source: $0) })
        defer { body.remove() }
        var req = request("/v1/demos/\(escape(demo))", method: "POST")
        req.setValue(body.contentType, forHTTPHeaderField: "content-type")
        req.timeoutInterval = 15 * 60  // a cold cell takes 13-25 s, a batch longer
        let (data, _) = try await send(req, upload: body.fileURL, acceptable: [200, 201, 207])
        return try Self.decodeRun(data)
    }

    // MARK: plumbing

    static func decodeRun(_ data: Data) throws -> RunOutcome {
        let d = JSONDecoder.keep
        do {
            if let probe = try JSONSerialization.jsonObject(with: data) as? [String: Any], probe["results"] != nil {
                return .batch(try d.decode(BatchResult.self, from: data))
            }
            return .single(try d.decode(RunResult.self, from: data))
        } catch { throw KeepError.decoding("\(error)") }
    }

    private func escape(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? s }

    func request(_ path: String, method: String = "GET", query: [URLQueryItem] = []) -> URLRequest {
        var c = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        let base = c.path.hasSuffix("/") ? String(c.path.dropLast()) : c.path
        c.path = base + path
        c.queryItems = query.isEmpty ? nil : query
        var r = URLRequest(url: c.url!)
        r.httpMethod = method
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.timeoutInterval = 30
        return r
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        let (data, _) = try await send(request(path, query: query))
        do { return try JSONDecoder.keep.decode(T.self, from: data) } catch { throw KeepError.decoding("\(error)") }
    }

    private func send(_ req: URLRequest, upload: URL? = nil, acceptable: Set<Int> = Set(200..<300)) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, resp): (Data, URLResponse) = try await {
                if let upload { return try await session.upload(for: req, fromFile: upload) }
                return try await session.data(for: req)
            }()
            guard let http = resp as? HTTPURLResponse else { throw KeepError.transport("not an HTTP response") }
            if http.statusCode == 401 { throw KeepError.unauthorized }
            guard acceptable.contains(http.statusCode) else {
                throw KeepError.http(status: http.statusCode, message: Self.errorMessage(data))
            }
            return (data, http)
        } catch let e as KeepError { throw e
        } catch let e as URLError { throw KeepError.transport(e.localizedDescription)
        } catch { throw KeepError.transport("\(error)") }
    }

    static func errorMessage(_ data: Data) -> String {
        if let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let m = o["error"] as? String { return m }
        let s = String(decoding: data.prefix(300), as: UTF8.self)
        return s.isEmpty ? "(no message)" : s
    }
}
