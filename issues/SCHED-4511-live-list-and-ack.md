---
id: SCHED-4511
title: Live list with Ack per row
status: ready
plan: R1, R2
---

On-call needs to see new incidents the moment they come in and take one with a click.

- New incidents appear at the top of the list as they arrive, newest first (R1).
- Each row gets an **Ack** button (`data-testid="ack"`). Clicking it calls `api.ack(id)` and marks the row
  acked (`data-testid="acked"`) (R2).

Acceptance: a new incident shows at the top without a reload; Ack on a row acks that incident.

## Change (product, 2026-11-16)

The row's Ack button goes. A row opens its incident panel (`data-testid="incident-panel"`, naming the incident id),
and the Ack (`data-testid="panel-ack"`) lives in the panel, so the incident is named before anyone acks it.

Acceptance after the change: a click that lands on a row that moved under the pointer opens that row's panel, and
the ack goes to the incident the panel names — never to a neighbour.
