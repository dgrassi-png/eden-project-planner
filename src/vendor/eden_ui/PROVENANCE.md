# Vendored E:DEN UI foundation (TRANSITORIO)

These files are **verbatim, unmodified copies** from the E:DEN monorepo. They
are not a second token source; do not edit them here.

| File | Source (simobarre-EDEN/eden-platform) | SHA-256 |
|---|---|---|
| `css/eden-foundation.css` | `shared/eden_ui/static/eden_ui/css/eden-foundation.css` | `e5af707731a0b59309a6437deb2e10e8486c31f021a74fc54d49d7f2edd4a433` |
| `css/eden-operational.css` | `shared/eden_ui/static/eden_ui/css/eden-system.css`, lines 74–115 (NC-UI Soft Mechanics Rev.01 operational Carbon/Ice block) | `e0e70db7f3703e62b6575b807b851a143e43205591e5e1345963da2e65136e0e` |
| `img/eden-mark.svg` | `shared/eden_ui/static/eden_ui/img/eden-mark.svg` | `d5c9113591bc8b6c4efb1af799862eb0b358fae70a270dbbc6aac0c8473f1a92` |

- Source commit: `fed71e67e57084cf7c826a14141d101e99ad99fe`
  (branch `foundation/phase-9-natura-linux-deployability`, 2026-09-16).
- Status: **TRANSITORIO**. When the planner moves into the monorepo as
  `frontends/planner`, delete this directory and import
  `../../shared/eden_ui/static/eden_ui/css/eden-foundation.css` directly, as
  `frontends/preorders` and `frontends/account` do. Then register the planner in
  `shared/eden_ui/tests/test_contract.py`.
- To update: copy the files again from the monorepo and update the hashes
  (`src/vendor/eden_ui/provenance.test.ts` fails on any unrecorded change).
