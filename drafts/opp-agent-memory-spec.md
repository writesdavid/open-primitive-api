# OPP Agent Memory Specification

**Version:** 0.1.0
**Status:** Draft
**Date:** 2026-04-20
**Author:** Open Primitive

---

## Abstract

This specification defines how an OPP-compatible agent stores and manages memory on the individual's device. The core principle is sovereignty: the agent's memory never leaves the device without explicit, scoped, per-request permission. Services see only what the agent chooses to reveal.

---

## 1. Memory Structure

The agent maintains a local store organized into six namespaces. Each namespace is a top-level key in the memory file.

### 1.1 `identity`

The agent's cryptographic identity.

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | `string` | Unique identifier, derived from the public key. |
| `publicKey` | `string` | Ed25519 public key, base64url-encoded. |
| `privateKey` | `string` | Ed25519 private key, base64url-encoded. Encrypted at rest. |
| `handle` | `string` | Human-readable label chosen by the individual. |
| `createdAt` | `string` | ISO 8601 timestamp. |

### 1.2 `preferences`

Defaults the agent applies to every intent unless overridden.

| Field | Type | Description |
|-------|------|-------------|
| `dataDensity` | `"minimal" \| "standard" \| "full"` | How much data the agent requests in responses. |
| `responseFormat` | `"json" \| "csv" \| "summary"` | Preferred response format. |
| `jurisdictions` | `string[]` | Geographic or legal jurisdictions the individual operates in. |
| `domainInterests` | `string[]` | Domains the agent prioritizes (e.g., `"food-safety"`, `"housing"`). |
| `budgetLimits` | `object` | Maximum spend per intent, per day, per service. Keys: `perIntent`, `perDay`, `perService`. Values in smallest currency unit. |
| `standingRules` | `Rule[]` | Automation rules for data sharing. See Section 3.2. |

### 1.3 `history`

Every intent submitted, every negotiation, every action taken.

| Field | Type | Description |
|-------|------|-------------|
| `entries` | `HistoryEntry[]` | Ordered by timestamp, newest first. |

Each `HistoryEntry`:

```json
{
  "id": "string",
  "timestamp": "ISO 8601",
  "type": "intent | negotiation | action | error",
  "serviceId": "string",
  "domain": "string",
  "request": {},
  "response": {},
  "relevance": 1.0,
  "summarizedFrom": null
}
```

`relevance` starts at `1.0` and decays per Section 6.

### 1.4 `relationships`

Services the agent has interacted with.

| Field | Type | Description |
|-------|------|-------------|
| `services` | `ServiceRecord[]` | One entry per service. |

Each `ServiceRecord`:

```json
{
  "serviceId": "string",
  "domain": "string",
  "firstContact": "ISO 8601",
  "lastContact": "ISO 8601",
  "interactionCount": 0,
  "trustScore": 0.5,
  "pastTerms": [],
  "notes": "string"
}
```

`trustScore` is a float from `0.0` to `1.0`. The agent calculates it from response accuracy, latency, and honesty of negotiation terms. The algorithm is implementation-specific. The score is never shared with the service.

### 1.5 `context`

Persistent facts about the individual that inform intent resolution.

| Field | Type | Description |
|-------|------|-------------|
| `facts` | `Fact[]` | Key-value pairs with metadata. |

Each `Fact`:

```json
{
  "key": "string",
  "value": "any",
  "addedAt": "ISO 8601",
  "source": "user | inferred",
  "confidence": 1.0
}
```

Examples: `{"key": "zipCode", "value": "94107"}`, `{"key": "householdSize", "value": 3}`.

Inferred facts carry a `confidence` score. The individual can confirm or delete any fact at any time.

### 1.6 `permissions`

What data each service has been granted access to.

| Field | Type | Description |
|-------|------|-------------|
| `grants` | `Grant[]` | Active and expired permissions. |

Each `Grant`:

```json
{
  "grantId": "string",
  "serviceId": "string",
  "field": "string",
  "scope": "once | duration | permanent",
  "expiresAt": "ISO 8601 | null",
  "grantedAt": "ISO 8601",
  "signature": "string"
}
```

`field` refers to a key in the `context` or `preferences` namespace. `signature` is the agent's Ed25519 signature over the grant object (minus the signature field), proving the grant is authentic.

---

## 2. Encryption

### 2.1 Key Derivation

The agent derives a 256-bit symmetric encryption key from its Ed25519 private key using HKDF-SHA256 with the info string `"opp-memory-v1"` and no salt.

### 2.2 Encryption at Rest

The entire memory file is encrypted using XChaCha20-Poly1305 with the derived key. The nonce is stored as the first 24 bytes of the file. The rest is ciphertext + auth tag.

File format:

```
[24 bytes nonce][ciphertext + 16 byte tag]
```

### 2.3 Private Key Protection

The Ed25519 private key never leaves the device. It is stored in the OS keychain where available (macOS Keychain, Windows DPAPI, Linux secret-service). On systems without a keychain, it is encrypted with a passphrase using Argon2id (memory: 64 MB, iterations: 3, parallelism: 1).

### 2.4 Loss and Recovery

If the device is lost, the memory is unrecoverable. Sovereignty means no backup authority exists. The individual starts fresh with a new keypair.

### 2.5 Optional Encrypted Backup

The individual can export the full memory file, re-encrypted with a passphrase-derived key (Argon2id, same parameters as 2.3). This backup file is portable. The individual is responsible for storing it.

---

## 3. Scoped Access

### 3.1 Request Flow

When a service requests information during intent resolution:

1. The service includes a `dataRequest` field in its negotiation response, listing the fields it needs and why.
2. The agent checks the `permissions` namespace for an active grant matching the service and field.
3. If a grant exists and has not expired, the agent includes the data and the grant signature in the next request.
4. If no grant exists, the agent checks `standingRules` in preferences.
5. If a standing rule matches, the agent creates a grant automatically.
6. If no rule matches, the agent asks the individual.
7. The individual chooses: deny, allow once, allow for a duration, or allow permanently.
8. The agent creates a signed `Grant`, stores it, and includes the data in the request.

### 3.2 Standing Rules

A standing rule automates permission decisions.

```json
{
  "field": "zipCode",
  "action": "allow",
  "scope": "once",
  "conditions": {
    "domainIn": ["food-safety", "housing"],
    "trustScoreMin": 0.7
  }
}
```

The agent evaluates conditions against the requesting service's `ServiceRecord`. If all conditions pass, the rule fires. The individual can add, edit, or delete standing rules at any time.

### 3.3 Verification

The service can verify a grant by checking the signature against the agent's public key. The signed payload is the grant object with the `signature` field set to an empty string, serialized as canonical JSON (sorted keys, no whitespace).

---

## 4. Portability

### 4.1 File Format

The decrypted memory is a single JSON file conforming to this schema:

```json
{
  "version": "0.1.0",
  "identity": {},
  "preferences": {},
  "history": {},
  "relationships": {},
  "context": {},
  "permissions": {}
}
```

Alternatively, implementations may use a SQLite database with one table per namespace. The JSON schema remains the canonical format. SQLite implementations must support export to JSON.

### 4.2 Migration

Any OPP-compatible agent can import another agent's memory:

1. The individual exports the decrypted memory as JSON.
2. The new agent reads the JSON and populates its own store.
3. The new agent generates a new keypair and `agentId`.
4. All existing grants become invalid (they were signed by the old key).
5. Relationships and history carry over. Trust scores carry over.
6. The individual does not lose anything except active permissions, which must be re-granted.

This is the right to leave, built into the protocol.

### 4.3 Schema Versioning

The `version` field follows semver. Agents must handle unknown fields by preserving them. Breaking changes increment the major version. Agents must refuse to import a memory file with a higher major version than they support.

---

## 5. Sync

Sync is optional. Single-device use is the default.

### 5.1 Multi-Device Sync

For individuals who use multiple devices:

1. The encrypted memory file (Section 2.2) is written to a storage backend: iCloud, S3, a USB drive, a local network share. Any writable location works.
2. The sync layer sees only ciphertext. It cannot read, index, or sell the memory contents.
3. The symmetric key (derived from the private key) must be present on each device. The individual transfers the private key manually (QR code, secure channel, physical media).
4. Conflict resolution: last-write-wins at the namespace level. Each namespace carries a `lastModified` timestamp. On conflict, the newer namespace wins. Implementations may offer merge strategies for the `history` namespace (append-only, deduplicate by `id`).

### 5.2 Sync is Not Backup

Sync replicates ciphertext. If the private key is lost on all devices, synced data is unrecoverable. The individual understands this.

---

## 6. Decay

### 6.1 Relevance Scoring

Every `HistoryEntry` has a `relevance` field. It starts at `1.0` and decays by `0.002` per day (reaching `~0.48` at one year).

The agent recalculates relevance on read, not on a timer:

```
relevance = max(0.0, 1.0 - (daysSinceTimestamp * 0.002))
```

Entries accessed or referenced by the individual reset to `1.0`.

### 6.2 Summarization

History entries older than 365 days with `relevance < 0.3` are eligible for summarization. The agent replaces individual entries with an aggregate record:

```json
{
  "id": "summary-2025-q1",
  "timestamp": "2025-03-31T23:59:59Z",
  "type": "summary",
  "serviceId": null,
  "domain": "food-safety",
  "request": null,
  "response": {
    "entryCount": 47,
    "topServices": ["service-a", "service-b"],
    "patterns": "47 recall queries, mostly dairy products"
  },
  "relevance": 0.5,
  "summarizedFrom": ["entry-1", "entry-2", "..."]
}
```

The original entries are deleted after summarization. The individual can disable summarization and keep raw history indefinitely.

### 6.3 Purge

The individual can purge any namespace at any time. Purge is immediate and irreversible. Purging `identity` destroys the keypair; the agent generates a new one.

### 6.4 Service Limits

Services cannot request memory older than the agent chooses to retain. If a service asks for history the agent has summarized or purged, the agent responds with what it has. No error, no apology. The agent's memory boundaries are not negotiable.

---

## Implementation Notes

A minimal conformant implementation requires:

- Ed25519 keypair generation and signing
- XChaCha20-Poly1305 encryption
- HKDF-SHA256 key derivation
- Argon2id for passphrase-based encryption
- JSON serialization
- A file system

No network. No server. No account. A developer can implement the core in a weekend.

---

## References

- Open Primitive Protocol Specification v0.1.0: [spec.html](https://openprimitive.com/spec.html)
- Ed25519: RFC 8032
- XChaCha20-Poly1305: draft-irtf-cfrg-xchacha
- HKDF: RFC 5869
- Argon2: RFC 9106
