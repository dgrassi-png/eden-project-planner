# E — Electrical Architecture Explorer

A standalone, single-file HTML tool (`architecture-explorer.html`) for exploring the
vehicle electrical architecture. It is a synoptic view, not a schematic or wiring diagram.
It is separate from the Planner app and has no build step.

The current dataset is a **representative placeholder**. Voltages, gauges and connector
families are illustrative and must be replaced with the real E / eBacco architecture.

## Replacing the dataset

The UI is generated entirely from the JSON in the `<script type="application/json" id="arch-data">`
block near the top of the file. You can:

1. edit or replace that block in the source, or
2. open the tool, choose **Data → Apply pasted JSON / Load .json file**. This copy is kept
   in that browser only (localStorage). Use **Copy JSON** to get it back out.

## Schema

| Collection    | Fields |
|---------------|--------|
| `categories`  | `{ CODE: { name, needsPower, needsGround } }`. Drives the power and ground warnings. |
| `zones`       | `{ id, name, x, y, w, h }`. Rectangles on the plan-view canvas, with the front at the top. |
| `components`  | `{ id, ref, name, category, zone, supply, can, x, y, notes, needsPower?, needsGround? }` |
| `connectors`  | `{ id, label, component, family, pins, class, notes }`. Set `component: null` for an inline connector (X01…) and give it `zone`, `x`, `y`. |
| `connections` | `{ id, from, fromConn, to, toConn, layer, vclass, signal, kind, wires, gauge, harness, via[], notes }`. `layer` is one of `power`, `ground`, `can`, `signal`. |
| `harnesses`   | `{ id, name, type, connA, connB[], conductors, status, notes }`. `type` is one of `p2p`, `branched`, `bus`. |

`id` is an internal key. `ref` is the visible reference code (BAT-01, VCU-01, MC-L01…).
Leave unknown values as `null`: the tool shows them as TBD and lists them under Warnings.
Harness origin, destinations, layers, signals, intermediate connectors and wire counts are
derived from the connections assigned to each harness.
