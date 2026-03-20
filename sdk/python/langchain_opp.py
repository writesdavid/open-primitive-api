"""
LangChain tool wrapper for Open Primitive Protocol (OPP).

Makes any OPP provider usable as a LangChain tool in one call.

Usage with LangChain:

    from langchain_opp import OPPToolkit
    from langchain.agents import create_react_agent

    toolkit = OPPToolkit("https://api.openprimitive.com")
    tools = toolkit.get_tools()
    agent = create_react_agent(llm, tools)
    agent.invoke("Is the water safe in ZIP 10001?")

Usage with CrewAI:

    from langchain_opp import OPPToolkit
    from crewai import Agent, Task, Crew

    toolkit = OPPToolkit("https://api.openprimitive.com")
    tools = toolkit.get_tools()

    researcher = Agent(
        role="Federal data researcher",
        goal="Answer questions using primary federal data sources",
        tools=tools,
        llm=llm,
    )
    task = Task(
        description="Check water safety for ZIP 10001",
        agent=researcher,
    )
    crew = Crew(agents=[researcher], tasks=[task])
    crew.kickoff()
"""

import json
from typing import Any, Dict, List, Optional

import requests
from langchain_core.tools import Tool


class OPPToolkit:
    """Fetches an OPP manifest and creates a LangChain Tool for each domain."""

    def __init__(self, base_url: str, timeout: int = 15):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._manifest = None

    def _fetch_manifest(self) -> Dict[str, Any]:
        if self._manifest is None:
            resp = requests.get(
                f"{self.base_url}/v1/manifest", timeout=self.timeout
            )
            resp.raise_for_status()
            self._manifest = resp.json()
        return self._manifest

    def _call_domain(self, domain_id: str, query: str) -> str:
        """Call a domain endpoint and return an agent-friendly string."""
        resp = requests.get(
            f"{self.base_url}/v1/{domain_id}",
            params={"q": query},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        envelope = resp.json()
        return _format_envelope(envelope)

    def _call_ask(self, query: str) -> str:
        """Route a natural-language question through /v1/ask."""
        resp = requests.post(
            f"{self.base_url}/v1/ask",
            json={"q": query},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        envelope = resp.json()
        return _format_envelope(envelope)

    def get_tools(self) -> List[Tool]:
        """Return a LangChain Tool for each domain plus an 'ask' router."""
        manifest = self._fetch_manifest()
        tools = []

        for domain in manifest.get("domains", []):
            domain_id = domain["id"]
            name = domain.get("name", domain_id)
            source = domain.get("source", "")
            description = (
                f"{name} — {source}. "
                "Returns OPP envelope with provenance and citations."
            )

            # Capture domain_id in closure
            def _make_fn(did: str):
                def fn(query: str) -> str:
                    return self._call_domain(did, query)
                return fn

            tools.append(
                Tool(
                    name=domain_id,
                    description=description,
                    func=_make_fn(domain_id),
                )
            )

        # Natural-language router
        tools.append(
            Tool(
                name="opp_ask",
                description=(
                    "Route a natural-language question to the best OPP domain. "
                    "Use this when you don't know which specific domain to query."
                ),
                func=self._call_ask,
            )
        )

        return tools


def _format_envelope(envelope: Dict[str, Any]) -> str:
    """Pull the citation statement and key data into a flat string."""
    parts = []

    citations = envelope.get("citations", {})
    statement = citations.get("statement")
    if statement:
        parts.append(statement)

    data = envelope.get("data")
    if data:
        if isinstance(data, list):
            # Show first 5 records to keep context short
            for record in data[:5]:
                parts.append(json.dumps(record, default=str))
            total = len(data)
            if total > 5:
                parts.append(f"... and {total - 5} more records")
        elif isinstance(data, dict):
            parts.append(json.dumps(data, default=str))
        else:
            parts.append(str(data))

    source_url = citations.get("source_url")
    if source_url:
        parts.append(f"Source: {source_url}")

    accessed = citations.get("accessed")
    if accessed:
        parts.append(f"Accessed: {accessed}")

    return "\n".join(parts) if parts else json.dumps(envelope, default=str)
