"""
Python client for the Open Primitive Protocol (OPP).

Usage:
    from opp_client import OPPClient
    client = OPPClient("https://api.openprimitive.com")
    data = client.query("drugs", name="aspirin")
    print(data["citations"]["statement"])
    verified = client.verify(data)
"""

import base64
import json
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import requests
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key


class OPPError(Exception):
    """Raised when an OPP request fails."""
    pass


class OPPClient:
    """Client for consuming Open Primitive Protocol providers."""

    def __init__(self, base_url: str, timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._session = requests.Session()
        self._manifest = None  # type: Optional[Dict[str, Any]]
        self._fetch_manifest()

    def _fetch_manifest(self) -> None:
        """Fetch and cache the OPP manifest from /.well-known/opp.json."""
        url = f"{self.base_url}/.well-known/opp.json"
        resp = self._session.get(url, timeout=self.timeout)
        if resp.status_code != 200:
            raise OPPError(f"Failed to fetch manifest from {url}: {resp.status_code}")
        self._manifest = resp.json()

    def get_manifest(self) -> Dict[str, Any]:
        """Return the cached manifest."""
        if self._manifest is None:
            self._fetch_manifest()
        return self._manifest

    def list_domains(self) -> List[str]:
        """Return the list of domains from the cached manifest."""
        manifest = self.get_manifest()
        domains = manifest.get("domains", [])
        if isinstance(domains, list):
            return [d.get("name", d) if isinstance(d, dict) else d for d in domains]
        return list(domains.keys()) if isinstance(domains, dict) else []

    def query(self, domain: str, **params: Any) -> Dict[str, Any]:
        """
        Query a domain endpoint.

        Args:
            domain: The data domain to query (e.g. "drugs", "food", "water").
            **params: Query parameters passed to the endpoint.

        Returns:
            Parsed JSON response.
        """
        qs = urlencode(params) if params else ""
        url = f"{self.base_url}/v1/{domain}"
        if qs:
            url = f"{url}?{qs}"
        resp = self._session.get(url, timeout=self.timeout)
        if resp.status_code != 200:
            raise OPPError(f"Query failed: {resp.status_code} {resp.text[:200]}")
        return resp.json()

    def ask(self, question: str) -> Dict[str, Any]:
        """
        Call the /v1/ask endpoint with a natural-language question.

        Args:
            question: Plain-text question.

        Returns:
            Parsed JSON response.
        """
        url = f"{self.base_url}/v1/ask"
        resp = self._session.get(url, params={"q": question}, timeout=self.timeout)
        if resp.status_code != 200:
            raise OPPError(f"Ask failed: {resp.status_code} {resp.text[:200]}")
        return resp.json()

    def verify(self, response: Dict[str, Any]) -> bool:
        """
        Verify the Ed25519 signature on an OPP response.

        Expects the response to contain a `signature` field (base64-encoded)
        and a `signed_payload` or `data` field that was signed. The public key
        comes from the cached manifest.

        Args:
            response: A parsed OPP response dict.

        Returns:
            True if the signature is valid, False otherwise.
        """
        manifest = self.get_manifest()
        public_key_pem = manifest.get("public_key")
        if not public_key_pem:
            raise OPPError("No public_key found in manifest")

        signature_b64 = response.get("signature")
        if not signature_b64:
            raise OPPError("No signature field in response")

        # Determine the payload that was signed.
        # Convention: if `signed_payload` exists use it, otherwise serialize `data`.
        if "signed_payload" in response:
            payload = response["signed_payload"]
            if isinstance(payload, dict):
                payload = json.dumps(payload, separators=(",", ":"), sort_keys=True)
            payload_bytes = payload.encode("utf-8")
        elif "data" in response:
            payload_bytes = json.dumps(
                response["data"], separators=(",", ":"), sort_keys=True
            ).encode("utf-8")
        else:
            raise OPPError("Response has no signed_payload or data to verify")

        signature = base64.b64decode(signature_b64)

        if isinstance(public_key_pem, str):
            public_key_pem = public_key_pem.encode("utf-8")
        key = load_pem_public_key(public_key_pem)

        if not isinstance(key, Ed25519PublicKey):
            raise OPPError("Manifest public_key is not Ed25519")

        try:
            key.verify(signature, payload_bytes)
            return True
        except Exception:
            return False
