# Workflow

Domain: `workflow`

Composite workflow, script-library, and macro-orchestration domain; the main built-in orchestration layer.

## Profiles

- workflow
- full

## Typical scenarios

- Capture APIs end-to-end
- Register and verify accounts
- Probe endpoints and inspect bundles
- Chain multi-step macro workflows

## Common combinations

- workflow + browser + network

## Full tool list (9)

| Tool | Description |
| --- | --- |
| `page_script_register` | Register a named reusable JS snippet in the Script Library. Execute with page_script_run. |
| `page_script_run` | Execute a named script from the Script Library with optional runtime params (__params__). |
| `api_probe_batch` | Batch-probe API endpoints in browser context with auto token injection and HTML skip. |
| `js_bundle_search` | Fetch a remote JS bundle and search it with named regex patterns, with caching and noise filtering. |
| `list_extension_workflows` | List runtime-loaded extension workflows from plugins/ or workflows/ directories. |
| `run_extension_workflow` | Execute an extension workflow by workflowId with optional config and timeout overrides. |
| `reverse_session` | Create, inspect, list, preview, or run an end-to-end reverse-engineering workflow session with artifact root, cross-domain tool calls, and evidence refs. |
| `run_macro` | Execute a registered macro with sequence, parallel, branch, fallback, and retry orchestration. |
| `list_macros` | List all available macros. |
