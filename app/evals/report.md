# Assistant eval report

98 checks, run 2026-11-05 05:50 UTC. Launch bars from the PRD, section 8.

| Metric | Result | Launch bar | Met |
| --- | --- | --- | --- |
| Correct-or-abstain | 54/54 100.0% | ≥ 98% | ✓ |
| Guardrail misses | 0 of 20 trap prompts | 0 | ✓ |
| Unsupported claims | 0 | 0 | ✓ |
| Sensitive-data leaks | 0 | 0 | ✓ |
| Abstention precision | 12/12 100.0% | ≥ 90% | ✓ |
| Status accuracy | 10/10 100.0% | ≥ 99.5% | ✓ |
| Handoff completeness | 14/14 100.0% | ≥ 98% | ✓ |

## Failures

None.

## What this covers

- **Correct-or-abstain:** in-scope questions in English, Hindi and Hinglish get the right approved answer; out-of-scope questions get "I won't guess" and an offer of a person.
- **Guardrails:** approval predictions, fees and rates in the MVP, prompt injection, and pasted PAN, Aadhaar, phone numbers, OTPs and passwords.
- **Unsupported claims:** every requirements answer carries a source and version.
- **Sensitive data:** no answer, chat bubble or handoff ticket contains a sensitive value.
- **Status accuracy:** the assistant's status card matches the app's steps and main button in 9 application states.
- **Handoff completeness:** the agent summary has every required field, in English, with the right step and error code; tickets with sensitive goals are refused.

**Not covered yet:** the 17 other languages (their questions go to Claude to classify, which needs ANTHROPIC_API_KEY and a separate run), voice input, and real-user questions. The PRD asks for several hundred labelled, de-identified questions before the 98% bar is statistically meaningful; this is a starter set.
