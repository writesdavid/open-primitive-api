# opp-client

Python client for the Open Primitive Protocol. Fetches federal data from OPP providers, verifies Ed25519 signatures, and works with LangChain or any Python workflow.

## Install

```bash
pip install .
```

Or directly:

```bash
pip install requests cryptography
```

## Quick start

```python
from opp_client import OPPClient

client = OPPClient("https://api.openprimitive.com")

# See what domains the provider serves
print(client.list_domains())

# Query a domain
data = client.query("drugs", name="aspirin")
print(data["citations"]["statement"])

# Verify the response signature
if client.verify(data):
    print("Signature checks out.")

# Ask a plain-language question
answer = client.ask("What are the side effects of ibuprofen?")
print(answer)

# Access the raw manifest
manifest = client.get_manifest()
print(manifest["provider"])
```

## LangChain integration

```python
from langchain.tools import Tool
from opp_client import OPPClient

client = OPPClient("https://api.openprimitive.com")

drug_tool = Tool(
    name="drug_lookup",
    description="Look up drug side effects and safety data from federal sources.",
    func=lambda name: client.query("drugs", name=name),
)
```

## API

| Method | Purpose |
|--------|---------|
| `OPPClient(base_url)` | Connect to a provider. Fetches and caches the manifest. |
| `query(domain, **params)` | Hit `/v1/{domain}?key=value` and return parsed JSON. |
| `verify(response)` | Check the Ed25519 signature against the manifest public key. Returns `True` or `False`. |
| `ask(question)` | Send a natural-language question to `/v1/ask?q=`. |
| `list_domains()` | Return domain names from the cached manifest. |
| `get_manifest()` | Return the full cached manifest dict. |

## Error handling

All failures raise `OPPError`:

```python
from opp_client import OPPClient, OPPError

try:
    data = client.query("drugs", name="notarealname")
except OPPError as e:
    print(f"Request failed: {e}")
```
