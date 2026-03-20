# Contributing to Open Primitive Protocol

## Report a Bug

Open an issue. Include the endpoint, the request you sent, and the response you got. Paste the full OPP envelope if relevant.

## Propose a Spec Change

1. Open an issue with the label `spec`.
2. Describe the problem the current spec creates.
3. Propose the change with a before/after example of the envelope or manifest.
4. Discussion happens in the issue. Accepted changes get a PR against `spec/opp-v1.md`.

## Add a New Data Domain

1. Fork the repo.
2. Create a new route in `api/v1/` following the existing pattern.
3. Every response must return a valid OPP envelope — domain, source, freshness, confidence, citations, and proof.
4. Add the domain to `sources/` with its federal agency, update frequency, and base URL.
5. Register the domain in `.well-known/opp.json`.
6. Add tests in `tests/` covering the envelope structure and at least one real query.
7. Open a PR. Describe the data source, the agency, and why it belongs here.

## Implement OPP for Your Own Data

You do not need to contribute here. OPP is an open protocol. To implement it:

1. Serve a manifest at `/.well-known/opp.json` declaring your domains and endpoints.
2. Wrap every response in the OPP envelope (see the spec for required fields).
3. For Level 3 conformance, sign envelopes with Ed25519.
4. Validate your implementation with `npx opp-validator https://your-domain.com`.

## Style

Write plain English. No jargon where a common word works. Match the voice of the existing docs.

## License

Contributions fall under MIT. By opening a PR, you agree to that.
